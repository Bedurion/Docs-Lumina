import fs from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingRoot = path.resolve(root, process.argv[2] || 'publication');
const submissionId = String(process.argv[3] || '').trim();
const sourceDataPath = path.join(root, 'data', 'community-media.json');
const stagedDataPath = path.join(stagingRoot, 'data', 'community-media-entry.json');
const maximumArtifactBytes = 10 * 1024 * 1024;
const maximumDataBytes = 10 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOnlyKeys(value, expectedKeys) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function assertString(value, minimum, maximum, label) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    fail(`${label} has invalid bounds.`);
  }
}

function assertIsoDate(value, label) {
  assertString(value, 20, 40, label);
  if (Number.isNaN(Date.parse(value))) fail(`${label} is not a valid date.`);
}

async function listRegularFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    const stats = await fs.lstat(absolutePath);

    if (stats.isSymbolicLink()) fail(`Artifact contains a blocked symbolic link: ${relativePath}`);
    if (stats.isDirectory()) {
      files.push(...await listRegularFiles(absolutePath, relativePath));
      continue;
    }
    if (!stats.isFile()) fail(`Artifact contains a blocked filesystem entry: ${relativePath}`);
    files.push({ relativePath, absolutePath, stats });
  }

  return files;
}

if (!/^WS-[A-Z2-9]{8}$/.test(submissionId)) {
  fail('Submission ID has an invalid format.');
}

if (stagingRoot === root || !stagingRoot.startsWith(`${root}${path.sep}`)) {
  fail('Artifact staging directory must remain isolated inside the repository checkout.');
}

const [sourceStats, stagedStats] = await Promise.all([
  fs.stat(sourceDataPath),
  fs.stat(stagedDataPath)
]);

if (sourceStats.size > maximumDataBytes || stagedStats.size > maximumDataBytes) {
  fail('Community media data exceeds its safe size limit.');
}

const [sourceData, stagedData, stagedFiles] = await Promise.all([
  fs.readFile(sourceDataPath, 'utf8').then(JSON.parse),
  fs.readFile(stagedDataPath, 'utf8').then(JSON.parse),
  listRegularFiles(stagingRoot)
]);

if (sourceData?.version !== 1 || !Array.isArray(sourceData.entries)) {
  fail('Community media data schema is invalid.');
}

if (sourceData.entries.some((entry) => entry?.id === submissionId)) {
  fail('Submission is already present in the repository.');
}

if (!isPlainObject(stagedData) || !hasOnlyKeys(stagedData, ['version', 'entry']) || stagedData.version !== 1) {
  fail('Publication artifact data schema is invalid.');
}

const entry = stagedData.entry;

if (!isPlainObject(entry) || !hasOnlyKeys(entry, ['id', 'title', 'description', 'credit', 'submittedAt', 'publishedAt', 'media'])) {
  fail('New gallery entry contains an invalid structure.');
}

if (entry.id !== submissionId) fail('Gallery entry does not match the requested submission.');
assertString(entry.title, 3, 100, 'Title');
assertString(entry.description, 10, 1200, 'Description');
assertString(entry.credit, 1, 100, 'Credit');
assertIsoDate(entry.submittedAt, 'Submission date');
assertIsoDate(entry.publishedAt, 'Publication date');

if (!Array.isArray(entry.media) || entry.media.length < 1 || entry.media.length > 4) {
  fail('Gallery entry must contain between one and four media files.');
}

const expectedFiles = new Set(['data/community-media-entry.json']);

for (const [index, media] of entry.media.entries()) {
  if (!isPlainObject(media) || !['image', 'video'].includes(media.type)) {
    fail('Gallery media metadata contains an invalid structure.');
  }

  const isVideo = media.type === 'video';
  const expectedKeys = isVideo
    ? ['type', 'src', 'alt', 'width', 'height', 'duration']
    : ['type', 'src', 'alt', 'width', 'height'];

  if (!hasOnlyKeys(media, expectedKeys)) {
    fail('Gallery media metadata contains unexpected fields.');
  }

  const expectedName = `${submissionId.toLowerCase()}-${index + 1}.${isVideo ? 'mp4' : 'webp'}`;
  const expectedSource = `assets/community/${expectedName}`;

  if (media.src !== expectedSource) fail('Gallery media path is not generated from the submission ID.');
  assertString(media.alt, 5, 340, 'Alternative text');

  if (
    !Number.isSafeInteger(media.width) ||
    !Number.isSafeInteger(media.height) ||
    media.width < 1 ||
    media.height < 1 ||
    media.width > (isVideo ? 1920 : 2400) ||
    media.height > (isVideo ? 1920 : 2400) ||
    media.width * media.height > 40_000_000
  ) {
    fail('Gallery media dimensions are invalid.');
  }

  if (isVideo && (
    typeof media.duration !== 'number' ||
    !Number.isFinite(media.duration) ||
    media.duration <= 0 ||
    media.duration > 120
  )) {
    fail('Gallery video duration is invalid.');
  }

  expectedFiles.add(expectedSource);
}

const actualFiles = new Set(stagedFiles.map((file) => file.relativePath));

if (
  actualFiles.size !== expectedFiles.size ||
  [...actualFiles].some((file) => !expectedFiles.has(file))
) {
  fail('Artifact contains missing or unexpected files.');
}

for (const file of stagedFiles.filter((candidate) => candidate.relativePath.endsWith('.webp'))) {
  if (file.stats.size < 12 || file.stats.size > maximumArtifactBytes) {
    fail(`Sanitized image has invalid size: ${file.relativePath}`);
  }

  const handle = await fs.open(file.absolutePath, 'r');
  const signature = Buffer.alloc(12);
  await handle.read(signature, 0, signature.length, 0);
  await handle.close();

  if (signature.subarray(0, 4).toString('ascii') !== 'RIFF' || signature.subarray(8, 12).toString('ascii') !== 'WEBP') {
    fail(`Sanitized image has an invalid WebP signature: ${file.relativePath}`);
  }
}

for (const file of stagedFiles.filter((candidate) => candidate.relativePath.endsWith('.mp4'))) {
  if (file.stats.size < 12 || file.stats.size > maximumArtifactBytes) {
    fail(`Sanitized video has invalid size: ${file.relativePath}`);
  }

  const handle = await fs.open(file.absolutePath, 'r');
  const signature = Buffer.alloc(12);
  await handle.read(signature, 0, signature.length, 0);
  await handle.close();

  if (signature.subarray(4, 8).toString('ascii') !== 'ftyp') {
    fail(`Sanitized video has an invalid MP4 signature: ${file.relativePath}`);
  }
}

await fs.mkdir(path.join(root, 'assets', 'community'), { recursive: true });

for (const media of entry.media) {
  await fs.copyFile(
    path.join(stagingRoot, media.src),
    path.join(root, media.src),
    fsConstants.COPYFILE_EXCL
  );
}

const temporaryDataPath = `${sourceDataPath}.${process.pid}.tmp`;
const updatedData = {
  version: 1,
  entries: [entry, ...sourceData.entries]
};
await fs.writeFile(temporaryDataPath, `${JSON.stringify(updatedData, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
await fs.rename(temporaryDataPath, sourceDataPath);

console.log(`Verified and staged publication artifact for ${submissionId}.`);
