import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decidePublication,
  emptyPublicationState,
  publicationRequestDigest,
  recordAppliedPublication,
  validatePublicationManifest,
  validatePublicationState
} from '../tools/community-publication-state.mjs';

const submissionId = 'WS-ABCDEFGH';
const firstDigest = 'a'.repeat(64);
const secondDigest = 'b'.repeat(64);

function manifest(overrides = {}) {
  return {
    version: 1,
    protocolVersion: 5,
    submissionId,
    dispatchId: '1234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:00:00.000Z',
    publicationRevision: 1,
    publicationBaseRevision: 0,
    workflowRunNumber: 100,
    contentType: 'art',
    operation: 'create',
    requestDigest: firstDigest,
    generatedAt: '2026-07-29T10:01:00.000Z',
    artifactMode: 'apply',
    ...overrides
  };
}

test('accepts the first version 5 publication from base revision zero', () => {
  assert.equal(decidePublication(emptyPublicationState(), manifest()), 'apply');
});

test('accepts version 6 creator credit updates under sequenced revision rules', () => {
  const request = manifest({
    protocolVersion: 6,
    operation: 'credit_update'
  });
  assert.equal(decidePublication(emptyPublicationState(), request), 'apply');
  const state = recordAppliedPublication(emptyPublicationState(), request);
  assert.equal(state.submissions[submissionId].protocolVersion, 6);
  assert.equal(state.submissions[submissionId].operation, 'credit_update');
});

test('never lets version 5 downgrade an existing version 6 publication record', () => {
  const versionSix = manifest({
    protocolVersion: 6,
    operation: 'credit_update'
  });
  const state = recordAppliedPublication(emptyPublicationState(), versionSix);
  const laterVersionFive = manifest({
    protocolVersion: 5,
    publicationRevision: 2,
    publicationBaseRevision: 1,
    workflowRunNumber: 101,
    dispatchId: '2234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:05:00.000Z',
    operation: 'update',
    requestDigest: secondDigest
  });

  assert.throws(
    () => decidePublication(state, laterVersionFive),
    /protocol cannot downgrade/
  );
});

test('treats an exact workflow rerun as an idempotent replay', () => {
  const request = manifest();
  const state = recordAppliedPublication(emptyPublicationState(), request);

  assert.equal(
    decidePublication(state, { ...request, artifactMode: 'replay' }),
    'replay'
  );
});

test('blocks an older publication revision', () => {
  const current = manifest({
    publicationRevision: 3,
    publicationBaseRevision: 2,
    workflowRunNumber: 102,
    dispatchId: '3334567890abcdef12345678',
    requestDigest: secondDigest
  });
  const state = recordAppliedPublication(emptyPublicationState(), current);

  assert.throws(
    () => decidePublication(state, manifest()),
    /older than repository state/
  );
});

test('a delayed queued run cannot overwrite a newer run that published first', () => {
  const newerQueuedRun = manifest({
    publicationRevision: 2,
    publicationBaseRevision: 0,
    workflowRunNumber: 102,
    dispatchId: '2234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:05:00.000Z',
    requestDigest: secondDigest
  });
  const stateAfterNewerRun = recordAppliedPublication(
    emptyPublicationState(),
    newerQueuedRun
  );

  assert.throws(
    () => decidePublication(stateAfterNewerRun, manifest()),
    /older than repository state/
  );
});

test('blocks a changed request whose base revision is stale', () => {
  const state = recordAppliedPublication(emptyPublicationState(), manifest());
  const staleUpdate = manifest({
    publicationRevision: 3,
    publicationBaseRevision: 0,
    workflowRunNumber: 103,
    dispatchId: '3334567890abcdef12345678',
    dispatchedAt: '2026-07-29T11:00:00.000Z',
    operation: 'update',
    requestDigest: secondDigest
  });

  assert.throws(
    () => decidePublication(state, staleUpdate),
    /base revision is stale/
  );
});

test('records a semantically identical retry after a partial workflow failure', () => {
  const state = recordAppliedPublication(emptyPublicationState(), manifest());
  const retry = manifest({
    publicationRevision: 2,
    publicationBaseRevision: 0,
    workflowRunNumber: 101,
    dispatchId: '2234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:05:00.000Z'
  });

  assert.equal(decidePublication(state, retry), 'record_retry');

  const updatedState = recordAppliedPublication(state, {
    ...retry,
    artifactMode: 'record_retry'
  });
  assert.equal(updatedState.submissions[submissionId].publicationRevision, 2);
  assert.equal(updatedState.submissions[submissionId].dispatchId, retry.dispatchId);
});

test('applies a changed request based on the current revision', () => {
  const state = recordAppliedPublication(emptyPublicationState(), manifest());
  const update = manifest({
    publicationRevision: 2,
    publicationBaseRevision: 1,
    workflowRunNumber: 101,
    dispatchId: '2234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:05:00.000Z',
    operation: 'update',
    requestDigest: secondDigest
  });

  assert.equal(decidePublication(state, update), 'apply');
});

test('never lets a legacy payload overwrite version 5 state', () => {
  const state = recordAppliedPublication(emptyPublicationState(), manifest());
  const legacy = manifest({
    protocolVersion: 4,
    publicationRevision: 999,
    publicationBaseRevision: 0,
    workflowRunNumber: 999,
    dispatchId: '9994567890abcdef12345678'
  });

  assert.throws(
    () => decidePublication(state, legacy),
    /legacy publication request cannot overwrite version 5/i
  );
});

test('migrates a semantically identical version 4 publication as a recorded retry', () => {
  const legacyRequest = manifest({
    protocolVersion: 4,
    publicationBaseRevision: 0,
    workflowRunNumber: 90,
    dispatchId: '9994567890abcdef12345678'
  });
  const legacyState = recordAppliedPublication(emptyPublicationState(), legacyRequest);
  const versionFiveRetry = manifest({
    publicationRevision: 1,
    publicationBaseRevision: 0,
    workflowRunNumber: 100,
    dispatchId: '1234567890abcdef12345678'
  });

  assert.equal(
    decidePublication(legacyState, versionFiveRetry),
    'record_retry'
  );
});

test('semantic request digest ignores dispatch metadata and signed URL queries', () => {
  const first = {
    version: 5,
    submissionId,
    dispatchId: '1234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:00:00.000Z',
    publicationRevision: 1,
    publicationBaseRevision: 0,
    operation: 'create',
    title: 'Same artwork',
    attachments: [{
      url: 'https://cdn.discordapp.com/attachments/1/2/file.png?ex=one&is=first',
      contentType: 'image/png',
      size: 123
    }]
  };
  const retry = {
    ...first,
    dispatchId: '2234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:05:00.000Z',
    publicationRevision: 2,
    attachments: [{
      ...first.attachments[0],
      url: 'https://media.discordapp.net/attachments/1/2/file.png?ex=two&is=second'
    }]
  };

  assert.equal(publicationRequestDigest(first), publicationRequestDigest(retry));
  assert.notEqual(
    publicationRequestDigest(first),
    publicationRequestDigest({ ...retry, title: 'Changed artwork' })
  );
});

test('rejects malformed manifest and state schemas', () => {
  assert.throws(
    () => validatePublicationManifest({ ...manifest(), token: 'blocked' }),
    /invalid schema/
  );
  assert.throws(
    () => validatePublicationState({ version: 1, submissions: [], extra: true }),
    /invalid schema/
  );
});
