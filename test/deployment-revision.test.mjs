import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { selectCommunityDeploymentRevision } from '../tools/select-community-deployment-revision.mjs';

const execute = promisify(execFile);

async function git(cwd, ...argumentsList) {
  const { stdout } = await execute('git', argumentsList, { cwd, encoding: 'utf8' });
  return stdout.trim();
}

async function commit(cwd, message) {
  await git(cwd, 'add', '.');
  await git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

async function writeState(cwd, submissions) {
  await fs.mkdir(path.join(cwd, '.github'), { recursive: true });
  await fs.writeFile(
    path.join(cwd, '.github', 'community-publication-state.json'),
    `${JSON.stringify({ version: 1, submissions }, null, 2)}\n`
  );
}

function publicationRecord(overrides = {}) {
  return {
    protocolVersion: 5,
    dispatchId: '1234567890abcdef12345678',
    dispatchedAt: '2026-07-29T10:00:00.000Z',
    publicationRevision: 1,
    workflowRunNumber: 100,
    contentType: 'art',
    operation: 'create',
    requestDigest: 'a'.repeat(64),
    appliedAt: '2026-07-29T10:01:00.000Z',
    ...overrides
  };
}

test('deployment selection keeps an exact publication across ordinary commits', async (t) => {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'luminox-deploy-selection-'));
  t.after(() => fs.rm(repository, { recursive: true, force: true }));
  await git(repository, 'init', '--initial-branch=main');
  await git(repository, 'config', 'user.name', 'Luminox Test');
  await git(repository, 'config', 'user.email', 'luminox-test@example.invalid');

  await writeState(repository, {
    'WS-ABCDEFGH': publicationRecord()
  });
  await fs.writeFile(path.join(repository, 'index.html'), 'publication one\n');
  const firstPublicationSha = await commit(repository, 'Publish first entry');

  await fs.writeFile(path.join(repository, 'README.md'), 'ordinary documentation commit\n');
  const ordinaryCommitSha = await commit(repository, 'Update documentation');

  assert.equal(
    await selectCommunityDeploymentRevision({
      cwd: repository,
      publishedSha: firstPublicationSha,
      latestSha: ordinaryCommitSha
    }),
    firstPublicationSha
  );
});

test('out-of-order runs deploy the newest ledger commit without including later ordinary commits', async (t) => {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'luminox-deploy-order-'));
  t.after(() => fs.rm(repository, { recursive: true, force: true }));
  await git(repository, 'init', '--initial-branch=main');
  await git(repository, 'config', 'user.name', 'Luminox Test');
  await git(repository, 'config', 'user.email', 'luminox-test@example.invalid');

  await writeState(repository, {
    'WS-ABCDEFGH': publicationRecord()
  });
  await fs.writeFile(path.join(repository, 'index.html'), 'publication one\n');
  const firstPublicationSha = await commit(repository, 'Publish first entry');

  await writeState(repository, {
    'WS-ABCDEFGH': publicationRecord(),
    'WS-BCDEFGHJ': publicationRecord({
      dispatchId: '2234567890abcdef12345678',
      dispatchedAt: '2026-07-29T10:05:00.000Z',
      workflowRunNumber: 101,
      requestDigest: 'b'.repeat(64)
    })
  });
  await fs.writeFile(path.join(repository, 'index.html'), 'publication two\n');
  const secondPublicationSha = await commit(repository, 'Publish second entry');

  await fs.writeFile(path.join(repository, 'README.md'), 'ordinary commit after publication\n');
  const latestOrdinarySha = await commit(repository, 'Update documentation again');

  assert.equal(
    await selectCommunityDeploymentRevision({
      cwd: repository,
      publishedSha: firstPublicationSha,
      latestSha: latestOrdinarySha
    }),
    secondPublicationSha
  );
  assert.equal(
    await selectCommunityDeploymentRevision({
      cwd: repository,
      publishedSha: secondPublicationSha,
      latestSha: latestOrdinarySha
    }),
    secondPublicationSha
  );
});

test('deployment selection rejects a branch that discarded the publication', async (t) => {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'luminox-deploy-diverged-'));
  t.after(() => fs.rm(repository, { recursive: true, force: true }));
  await git(repository, 'init', '--initial-branch=main');
  await git(repository, 'config', 'user.name', 'Luminox Test');
  await git(repository, 'config', 'user.email', 'luminox-test@example.invalid');

  await writeState(repository, {
    'WS-ABCDEFGH': publicationRecord()
  });
  const publishedSha = await commit(repository, 'Publish entry');

  await git(repository, 'checkout', '--orphan', 'rewritten');
  await fs.rm(path.join(repository, '.github'), { recursive: true, force: true });
  await fs.writeFile(path.join(repository, 'replacement.txt'), 'rewritten history\n');
  const rewrittenSha = await commit(repository, 'Rewrite branch');

  await assert.rejects(
    selectCommunityDeploymentRevision({
      cwd: repository,
      publishedSha,
      latestSha: rewrittenSha
    }),
    /no longer contains/
  );
});
