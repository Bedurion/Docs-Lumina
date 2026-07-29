import { createHash } from 'node:crypto';

const submissionIdPattern = /^WS-[A-Z2-9]{8}$/;
const dispatchIdPattern = /^[a-f0-9]{24}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const contentTypes = new Set(['gallery', 'blog', 'art', 'roleplay']);
const operationsByContentType = new Map([
  ['gallery', new Set(['create', 'update', 'credit_update'])],
  ['art', new Set(['create', 'update', 'credit_update'])],
  ['blog', new Set(['create', 'update', 'hide', 'unhide', 'delete', 'hide_for_changes', 'credit_update'])],
  ['roleplay', new Set(['create', 'update', 'hide', 'unhide', 'delete', 'hide_for_changes', 'credit_update'])]
]);
const manifestKeys = [
  'version',
  'protocolVersion',
  'submissionId',
  'dispatchId',
  'dispatchedAt',
  'publicationRevision',
  'publicationBaseRevision',
  'workflowRunNumber',
  'contentType',
  'operation',
  'requestDigest',
  'generatedAt',
  'artifactMode'
];
const stateRecordKeys = [
  'protocolVersion',
  'dispatchId',
  'dispatchedAt',
  'publicationRevision',
  'workflowRunNumber',
  'contentType',
  'operation',
  'requestDigest',
  'appliedAt'
];
const artifactModes = new Set(['apply', 'replay', 'record_retry']);

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value, expectedKeys) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function assertSafeInteger(value, minimum, label) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${label} must be a safe integer greater than or equal to ${minimum}.`);
  }
}

function assertIsoDate(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 20 ||
    value.length > 40 ||
    Number.isNaN(Date.parse(value))
  ) {
    fail(`${label} must be a valid ISO date.`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function normalizeAttachmentUrl(value) {
  if (typeof value !== 'string') return value;

  try {
    const url = new URL(value);
    return url.pathname;
  } catch {
    return value;
  }
}

function normalizeRequestForDigest(payload) {
  const normalized = {};
  const excludedKeys = new Set([
    'version',
    'dispatchId',
    'dispatchedAt',
    'publicationRevision',
    'publicationBaseRevision'
  ]);

  for (const [key, value] of Object.entries(payload || {})) {
    if (excludedKeys.has(key)) continue;

    if (key === 'attachments' && Array.isArray(value)) {
      normalized.attachments = value.map((attachment) => {
        if (!isPlainObject(attachment)) return attachment;
        return {
          ...attachment,
          url: normalizeAttachmentUrl(attachment.url)
        };
      });
      continue;
    }

    normalized[key] = value;
  }

  return canonicalize(normalized);
}

export function publicationRequestDigest(payload) {
  const normalized = normalizeRequestForDigest(payload);
  return createHash('sha256')
    .update(JSON.stringify(normalized), 'utf8')
    .digest('hex');
}

export function emptyPublicationState() {
  return {
    version: 1,
    submissions: {}
  };
}

export function validatePublicationState(value) {
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value, ['version', 'submissions']) ||
    value.version !== 1 ||
    !isPlainObject(value.submissions)
  ) {
    fail('Publication state has an invalid schema.');
  }

  for (const [submissionId, record] of Object.entries(value.submissions)) {
    if (!submissionIdPattern.test(submissionId)) {
      fail('Publication state contains an invalid submission ID.');
    }
    if (!isPlainObject(record) || !hasOnlyKeys(record, stateRecordKeys)) {
      fail(`Publication state record ${submissionId} has an invalid schema.`);
    }
    if (![4, 5, 6].includes(record.protocolVersion)) {
      fail(`Publication state record ${submissionId} has an invalid protocol version.`);
    }
    if (!dispatchIdPattern.test(record.dispatchId)) {
      fail(`Publication state record ${submissionId} has an invalid dispatch ID.`);
    }
    assertIsoDate(record.dispatchedAt, `Publication state dispatch date for ${submissionId}`);
    assertSafeInteger(record.publicationRevision, 1, `Publication revision for ${submissionId}`);
    assertSafeInteger(record.workflowRunNumber, 1, `Workflow run number for ${submissionId}`);
    if (!contentTypes.has(record.contentType)) {
      fail(`Publication state record ${submissionId} has an invalid content type.`);
    }
    if (!operationsByContentType.get(record.contentType)?.has(record.operation)) {
      fail(`Publication state record ${submissionId} has an invalid operation.`);
    }
    if (!digestPattern.test(record.requestDigest)) {
      fail(`Publication state record ${submissionId} has an invalid request digest.`);
    }
    assertIsoDate(record.appliedAt, `Publication state application date for ${submissionId}`);
  }

  return value;
}

export function validatePublicationManifest(manifest, expected = {}) {
  if (
    !isPlainObject(manifest) ||
    !hasOnlyKeys(manifest, manifestKeys) ||
    manifest.version !== 1 ||
    ![4, 5, 6].includes(manifest.protocolVersion)
  ) {
    fail('Publication manifest has an invalid schema.');
  }

  if (!submissionIdPattern.test(manifest.submissionId)) {
    fail('Publication manifest has an invalid submission ID.');
  }
  if (!dispatchIdPattern.test(manifest.dispatchId)) {
    fail('Publication manifest has an invalid dispatch ID.');
  }
  assertIsoDate(manifest.dispatchedAt, 'Publication manifest dispatch date');
  assertSafeInteger(manifest.publicationRevision, 1, 'Publication revision');
  assertSafeInteger(manifest.publicationBaseRevision, 0, 'Publication base revision');
  assertSafeInteger(manifest.workflowRunNumber, 1, 'Workflow run number');

  if (
    manifest.protocolVersion >= 5 &&
    manifest.publicationBaseRevision >= manifest.publicationRevision
  ) {
    fail('Publication base revision must be older than its revision.');
  }
  if (manifest.protocolVersion === 4 && manifest.publicationBaseRevision !== 0) {
    fail('Legacy publication manifests cannot declare a base revision.');
  }
  if (!contentTypes.has(manifest.contentType)) {
    fail('Publication manifest has an invalid content type.');
  }
  if (!operationsByContentType.get(manifest.contentType)?.has(manifest.operation)) {
    fail('Publication manifest has an invalid operation.');
  }
  if (!digestPattern.test(manifest.requestDigest)) {
    fail('Publication manifest has an invalid request digest.');
  }
  assertIsoDate(manifest.generatedAt, 'Publication manifest generation date');
  if (!artifactModes.has(manifest.artifactMode)) {
    fail('Publication manifest has an invalid artifact mode.');
  }

  const expectedFields = [
    'submissionId',
    'dispatchId',
    'workflowRunNumber',
    'publicationRevision',
    'protocolVersion'
  ];

  for (const field of expectedFields) {
    if (expected[field] !== undefined && manifest[field] !== expected[field]) {
      fail(`Publication manifest ${field} does not match the workflow request.`);
    }
  }

  return manifest;
}

function sameAppliedRequest(current, manifest) {
  return (
    current.protocolVersion === manifest.protocolVersion &&
    current.publicationRevision === manifest.publicationRevision &&
    current.dispatchId === manifest.dispatchId &&
    current.requestDigest === manifest.requestDigest &&
    current.contentType === manifest.contentType &&
    current.operation === manifest.operation &&
    current.dispatchedAt === manifest.dispatchedAt
  );
}

function sameSemanticRequest(current, manifest) {
  return (
    current.requestDigest === manifest.requestDigest &&
    current.contentType === manifest.contentType &&
    current.operation === manifest.operation
  );
}

export function decidePublication(state, manifest) {
  validatePublicationState(state);
  validatePublicationManifest(manifest);

  const current = state.submissions[manifest.submissionId] || null;

  if (!current) {
    if (manifest.publicationBaseRevision !== 0) {
      fail('Publication base revision does not exist in repository state.');
    }
    return 'apply';
  }

  if (manifest.protocolVersion === 4) {
    if (current.protocolVersion >= 5) {
      fail('A legacy publication request cannot overwrite version 5 or 6 publication state.');
    }
    if (manifest.workflowRunNumber < current.workflowRunNumber) {
      fail('Legacy publication request is older than repository state.');
    }
    if (manifest.workflowRunNumber === current.workflowRunNumber) {
      if (!sameAppliedRequest(current, manifest)) {
        fail('Legacy publication revision conflicts with repository state.');
      }
      return 'replay';
    }
    if (sameSemanticRequest(current, manifest)) {
      return 'record_retry';
    }
    fail('Legacy publication updates require a sequenced payload.');
  }

  if (current.protocolVersion > manifest.protocolVersion) {
    fail('Publication protocol cannot downgrade repository state.');
  }

  if (current.protocolVersion === 4) {
    if (manifest.publicationBaseRevision !== 0) {
      fail('The first sequenced publication must migrate from base revision zero.');
    }
    return sameSemanticRequest(current, manifest) ? 'record_retry' : 'apply';
  }

  if (manifest.publicationRevision < current.publicationRevision) {
    fail('Publication request is older than repository state.');
  }

  if (manifest.publicationRevision === current.publicationRevision) {
    if (!sameAppliedRequest(current, manifest)) {
      fail('Publication revision conflicts with repository state.');
    }
    return 'replay';
  }

  if (manifest.publicationBaseRevision === current.publicationRevision) {
    return sameSemanticRequest(current, manifest) ? 'record_retry' : 'apply';
  }

  if (sameSemanticRequest(current, manifest)) {
    return 'record_retry';
  }

  fail('Publication base revision is stale.');
}

export function recordAppliedPublication(state, manifest) {
  validatePublicationState(state);
  validatePublicationManifest(manifest);

  return {
    version: 1,
    submissions: {
      ...state.submissions,
      [manifest.submissionId]: {
        protocolVersion: manifest.protocolVersion,
        dispatchId: manifest.dispatchId,
        dispatchedAt: manifest.dispatchedAt,
        publicationRevision: manifest.publicationRevision,
        workflowRunNumber: manifest.workflowRunNumber,
        contentType: manifest.contentType,
        operation: manifest.operation,
        requestDigest: manifest.requestDigest,
        appliedAt: manifest.generatedAt
      }
    }
  };
}

export const publicationStateSchema = Object.freeze({
  submissionIdPattern,
  dispatchIdPattern
});
