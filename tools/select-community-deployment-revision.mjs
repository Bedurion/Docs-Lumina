import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validatePublicationState } from './community-publication-state.mjs';

const execute = promisify(execFile);
const shaPattern = /^[a-f0-9]{40}$/;
const publicationStatePath = '.github/community-publication-state.json';

async function runGit(cwd, argumentsList) {
  return execute('git', argumentsList, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
}

async function isAncestor(cwd, ancestor, descendant) {
  try {
    await runGit(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

async function validateStateAtRevision(cwd, revision) {
  const { stdout } = await runGit(cwd, [
    'show',
    `${revision}:${publicationStatePath}`
  ]);
  validatePublicationState(JSON.parse(stdout));
}

export async function selectCommunityDeploymentRevision({
  cwd = process.cwd(),
  publishedSha,
  latestSha
}) {
  if (!shaPattern.test(publishedSha) || !shaPattern.test(latestSha)) {
    throw new Error('Deployment revisions must be full lowercase Git commit SHAs.');
  }

  if (!await isAncestor(cwd, publishedSha, latestSha)) {
    throw new Error('The current branch no longer contains the published revision.');
  }

  await validateStateAtRevision(cwd, publishedSha);

  if (publishedSha === latestSha) {
    return publishedSha;
  }

  const { stdout } = await runGit(cwd, [
    'rev-list',
    '--first-parent',
    '-1',
    `${publishedSha}..${latestSha}`,
    '--',
    publicationStatePath
  ]);
  const newerPublicationSha = stdout.trim();

  if (!newerPublicationSha) {
    return publishedSha;
  }
  if (
    !shaPattern.test(newerPublicationSha) ||
    !await isAncestor(cwd, publishedSha, newerPublicationSha) ||
    !await isAncestor(cwd, newerPublicationSha, latestSha)
  ) {
    throw new Error('The newer publication revision is not on the safe deployment path.');
  }

  await validateStateAtRevision(cwd, newerPublicationSha);
  return newerPublicationSha;
}

const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const currentFile = fileURLToPath(import.meta.url);

if (executedFile === currentFile) {
  selectCommunityDeploymentRevision({
    publishedSha: String(process.argv[2] || '').trim(),
    latestSha: String(process.argv[3] || '').trim()
  })
    .then((revision) => console.log(revision))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
