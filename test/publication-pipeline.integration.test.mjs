import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secret = Buffer.from('11'.repeat(32), 'hex');
const submissionId = 'WS-ABCDEFGH';

function encryptPayload(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url')
  ].join('.');
}

async function prepareRepository() {
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'luminox-publication-test-')
  );
  await Promise.all([
    fs.mkdir(path.join(temporaryRoot, 'tools'), { recursive: true }),
    fs.mkdir(path.join(temporaryRoot, 'data'), { recursive: true }),
    fs.mkdir(path.join(temporaryRoot, '.github'), { recursive: true })
  ]);

  await Promise.all([
    'community-publication-state.mjs',
    'publish-community-media.mjs',
    'verify-community-artifact.mjs'
  ].map((file) => fs.copyFile(
    path.join(repositoryRoot, 'tools', file),
    path.join(temporaryRoot, 'tools', file)
  )));

  await fs.symlink(
    path.join(repositoryRoot, 'node_modules'),
    path.join(temporaryRoot, 'node_modules'),
    'dir'
  );
  await fs.copyFile(
    path.join(repositoryRoot, '.github', 'community-publication-state.json'),
    path.join(temporaryRoot, '.github', 'community-publication-state.json')
  );
  await fs.writeFile(
    path.join(temporaryRoot, 'data', 'blog-posts.json'),
    `${JSON.stringify({
      version: 1,
      posts: [{
        id: submissionId,
        title: 'Existing article',
        visible: true,
        updatedAt: '2026-07-28T10:00:00.000Z'
      }]
    }, null, 2)}\n`
  );
  await Promise.all([
    ['community-media.json', { version: 1, entries: [] }],
    ['art-entries.json', { version: 1, entries: [] }],
    ['roleplay-stories.json', { version: 1, stories: [] }]
  ].map(([file, data]) => fs.writeFile(
    path.join(temporaryRoot, 'data', file),
    `${JSON.stringify(data, null, 2)}\n`
  )));

  return temporaryRoot;
}

function payload(overrides = {}) {
  return {
    version: 5,
    submissionId,
    dispatchId: '1234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:00:00.000Z',
    publicationRevision: 1,
    publicationBaseRevision: 0,
    operation: 'hide',
    contentType: 'blog',
    title: 'Existing article',
    submittedAt: '2026-07-28T10:00:00.000Z',
    attachments: [],
    ...overrides
  };
}

async function sanitize(temporaryRoot, publicationPayload, workflowRunNumber) {
  await fs.rm(path.join(temporaryRoot, 'publication'), {
    recursive: true,
    force: true
  });
  await execute(
    process.execPath,
    ['tools/publish-community-media.mjs'],
    {
      cwd: temporaryRoot,
      env: {
        ...process.env,
        SUBMISSION_ID: submissionId,
        DISPATCH_ID: publicationPayload.dispatchId,
        ENCRYPTED_PAYLOAD: encryptPayload(publicationPayload),
        PUBLISH_PAYLOAD_SECRET: secret.toString('hex'),
        PUBLICATION_WORKFLOW_RUN_NUMBER: String(workflowRunNumber),
        PUBLICATION_OUTPUT_DIR: 'publication'
      }
    }
  );
}

async function verify(temporaryRoot, dispatchId, workflowRunNumber) {
  await execute(
    process.execPath,
    [
      'tools/verify-community-artifact.mjs',
      'publication',
      submissionId,
      dispatchId,
      String(workflowRunNumber)
    ],
    { cwd: temporaryRoot, env: process.env }
  );
}

test('pipeline applies once, replays safely, and records a retry after deploy failure', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));

  const firstRequest = payload();
  await sanitize(temporaryRoot, firstRequest, 100);
  await verify(temporaryRoot, firstRequest.dispatchId, 100);

  const appliedBlog = JSON.parse(
    await fs.readFile(path.join(temporaryRoot, 'data', 'blog-posts.json'), 'utf8')
  );
  assert.equal(appliedBlog.posts[0].visible, false);

  // A push can succeed even when the client sees a transport failure. Reusing
  // the original apply artifact against the now-current branch must be safe.
  await verify(temporaryRoot, firstRequest.dispatchId, 100);

  await sanitize(temporaryRoot, firstRequest, 100);
  const replayManifest = JSON.parse(
    await fs.readFile(
      path.join(temporaryRoot, 'publication', 'publication-manifest.json'),
      'utf8'
    )
  );
  assert.equal(replayManifest.artifactMode, 'replay');
  await verify(temporaryRoot, firstRequest.dispatchId, 100);

  const retryRequest = payload({
    dispatchId: '2234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:10:00.000Z',
    publicationRevision: 2
  });
  await sanitize(temporaryRoot, retryRequest, 101);
  const retryManifest = JSON.parse(
    await fs.readFile(
      path.join(temporaryRoot, 'publication', 'publication-manifest.json'),
      'utf8'
    )
  );
  assert.equal(retryManifest.artifactMode, 'record_retry');
  await verify(temporaryRoot, retryRequest.dispatchId, 101);

  const state = JSON.parse(
    await fs.readFile(
      path.join(temporaryRoot, '.github', 'community-publication-state.json'),
      'utf8'
    )
  );
  assert.equal(state.submissions[submissionId].publicationRevision, 2);
  assert.equal(state.submissions[submissionId].dispatchId, retryRequest.dispatchId);
});
