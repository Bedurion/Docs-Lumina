import fs from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingRoot = path.resolve(root, process.argv[2] || 'publication');
const submissionId = String(process.argv[3] || '').trim();
const gallerySourcePath = path.join(root, 'data', 'community-media.json');
const blogSourcePath = path.join(root, 'data', 'blog-posts.json');
const stagedGalleryPath = path.join(stagingRoot, 'data', 'community-media-entry.json');
const stagedBlogOperationPath = path.join(stagingRoot, 'data', 'blog-operation.json');
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
  if (
    typeof value !== 'string' ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    fail(`${label} has invalid bounds or characters.`);
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
    if (stats.size > maximumArtifactBytes) fail(`Artifact file exceeds its size limit: ${relativePath}`);
    files.push({ relativePath, absolutePath, stats });
  }

  return files;
}

async function readBoundedJson(filePath, label) {
  const stats = await fs.stat(filePath);
  if (stats.size <= 0 || stats.size > maximumDataBytes) fail(`${label} exceeds its safe size limit.`);
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await fs.rename(temporaryPath, filePath);
}

if (!/^WS-[A-Z2-9]{8}$/.test(submissionId)) {
  fail('Submission ID has an invalid format.');
}

if (stagingRoot === root || !stagingRoot.startsWith(`${root}${path.sep}`)) {
  fail('Artifact staging directory must remain isolated inside the repository checkout.');
}

const stagedFiles = await listRegularFiles(stagingRoot);
const stagedFileNames = new Set(stagedFiles.map((file) => file.relativePath));
const hasGalleryArtifact = stagedFileNames.has('data/community-media-entry.json');
const hasBlogArtifact = stagedFileNames.has('data/blog-operation.json');

if (hasGalleryArtifact === hasBlogArtifact) {
  fail('Artifact must contain exactly one recognized publication type.');
}

if (hasBlogArtifact) {
  const [sourceData, operationData] = await Promise.all([
    readBoundedJson(blogSourcePath, 'Blog data'),
    readBoundedJson(stagedBlogOperationPath, 'Blog operation data')
  ]);

  if (!isPlainObject(sourceData) || !hasOnlyKeys(sourceData, ['version', 'posts']) || sourceData.version !== 1 || !Array.isArray(sourceData.posts)) {
    fail('Blog data schema is invalid.');
  }
  if (
    !isPlainObject(operationData) ||
    !hasOnlyKeys(operationData, ['version', 'operation', 'submissionId', 'operationAt', 'post']) ||
    operationData.version !== 1 ||
    operationData.submissionId !== submissionId ||
    !['create', 'update', 'hide', 'unhide', 'delete', 'hide_for_changes'].includes(operationData.operation)
  ) {
    fail('Blog operation artifact has an invalid schema.');
  }

  assertIsoDate(operationData.operationAt, 'Blog operation date');
  const existingIndex = sourceData.posts.findIndex((post) => post?.id === submissionId);
  const requiresExisting = operationData.operation !== 'create';

  if (operationData.operation === 'create' && existingIndex >= 0) {
    fail('Blog submission is already present in the repository.');
  }
  if (requiresExisting && existingIndex < 0) {
    fail('Blog operation targets an article that does not exist.');
  }

  const expectedFiles = new Set(['data/blog-operation.json']);
  const post = operationData.post;

  if (['create', 'update'].includes(operationData.operation)) {
    const postKeys = [
      'id', 'title', 'excerpt', 'body', 'category', 'author', 'submittedAt',
      'publishedAt', 'updatedAt', 'visible', 'readingMinutes', 'views',
      'leadersSelection', 'media'
    ];

    if (!isPlainObject(post) || !hasOnlyKeys(post, postKeys) || post.id !== submissionId) {
      fail('Blog post contains an invalid structure.');
    }

    assertString(post.title, 3, 100, 'Blog title');
    assertString(post.excerpt, 20, 300, 'Blog excerpt');
    assertString(post.body, 100, 4000, 'Blog body');
    assertString(post.category, 2, 50, 'Blog category');
    assertString(post.author, 1, 100, 'Blog author');
    assertIsoDate(post.submittedAt, 'Submission date');
    assertIsoDate(post.publishedAt, 'Publication date');
    assertIsoDate(post.updatedAt, 'Blog update date');

    if (typeof post.visible !== 'boolean') fail('Blog visibility must be boolean.');
    if (!Number.isSafeInteger(post.readingMinutes) || post.readingMinutes < 1 || post.readingMinutes > 60) {
      fail('Blog reading time is invalid.');
    }
    if (!Number.isSafeInteger(post.views) || post.views < 0) fail('Blog view total is invalid.');
    if (typeof post.leadersSelection !== 'boolean') fail('Blog leadership selection must be boolean.');
    if (!Array.isArray(post.media) || post.media.length > 4) {
      fail('Blog media must contain at most four images.');
    }

    for (const [index, media] of post.media.entries()) {
      if (!isPlainObject(media) || !hasOnlyKeys(media, ['type', 'src', 'alt', 'width', 'height']) || media.type !== 'image') {
        fail('Blog media contains an invalid structure.');
      }

      const expectedSource = `assets/community/${submissionId.toLowerCase()}-blog-${index + 1}.webp`;
      if (media.src !== expectedSource) fail('Blog media path is not generated from the submission ID.');
      assertString(media.alt, 3, 300, 'Blog image alternative text');

      if (
        !Number.isSafeInteger(media.width) ||
        !Number.isSafeInteger(media.height) ||
        media.width < 1 ||
        media.height < 1 ||
        media.width > 2400 ||
        media.height > 2400 ||
        media.width * media.height > 40_000_000
      ) {
        fail('Blog image dimensions are invalid.');
      }

      expectedFiles.add(expectedSource);
    }
  } else if (post !== null) {
    fail('This Blog management operation cannot contain article content.');
  }

  if (
    stagedFileNames.size !== expectedFiles.size ||
    [...stagedFileNames].some((file) => !expectedFiles.has(file))
  ) {
    fail('Blog artifact contains missing or unexpected files.');
  }

  for (const file of stagedFiles.filter((candidate) => candidate.relativePath.endsWith('.webp'))) {
    if (file.stats.size < 12) fail(`Sanitized Blog image has invalid size: ${file.relativePath}`);
    const handle = await fs.open(file.absolutePath, 'r');
    const signature = Buffer.alloc(12);
    await handle.read(signature, 0, signature.length, 0);
    await handle.close();
    if (signature.subarray(0, 4).toString('ascii') !== 'RIFF' || signature.subarray(8, 12).toString('ascii') !== 'WEBP') {
      fail(`Sanitized Blog image has an invalid WebP signature: ${file.relativePath}`);
    }
  }

  const removeStoredMedia = async (storedPost) => {
    for (const media of storedPost?.media || []) {
      const expectedPrefix = `assets/community/${submissionId.toLowerCase()}-blog-`;

      if (
        typeof media?.src !== 'string' ||
        !media.src.startsWith(expectedPrefix) ||
        !/^assets\/community\/ws-[a-z2-9]{8}-blog-\d+\.webp$/.test(media.src)
      ) {
        fail('Stored Blog media path is unsafe.');
      }

      await fs.rm(path.join(root, media.src), { force: true });
    }
  };

  const updatedPosts = [...sourceData.posts];

  if (operationData.operation === 'create') {
    updatedPosts.unshift(post);
  } else if (operationData.operation === 'update') {
    await removeStoredMedia(updatedPosts[existingIndex]);
    updatedPosts[existingIndex] = post;
  } else if (operationData.operation === 'delete') {
    await removeStoredMedia(updatedPosts[existingIndex]);
    updatedPosts.splice(existingIndex, 1);
  } else {
    updatedPosts[existingIndex] = {
      ...updatedPosts[existingIndex],
      visible: operationData.operation === 'unhide',
      updatedAt: operationData.operationAt
    };
  }

  if (['create', 'update'].includes(operationData.operation)) {
    await fs.mkdir(path.join(root, 'assets', 'community'), { recursive: true });

    for (const media of post.media) {
      await fs.copyFile(
        path.join(stagingRoot, media.src),
        path.join(root, media.src),
        fsConstants.COPYFILE_EXCL
      );
    }
  }

  await writeJsonAtomically(blogSourcePath, {
    version: 1,
    posts: updatedPosts
  });
  console.log(`Verified and applied Blog ${operationData.operation} operation for ${submissionId}.`);
} else {
  const [sourceData, stagedData] = await Promise.all([
    readBoundedJson(gallerySourcePath, 'Community media data'),
    readBoundedJson(stagedGalleryPath, 'Gallery artifact data')
  ]);

  if (!isPlainObject(sourceData) || !hasOnlyKeys(sourceData, ['version', 'entries']) || sourceData.version !== 1 || !Array.isArray(sourceData.entries)) {
    fail('Community media data schema is invalid.');
  }
  if (sourceData.entries.some((entry) => entry?.id === submissionId)) {
    fail('Gallery submission is already present in the repository.');
  }
  if (!isPlainObject(stagedData) || !hasOnlyKeys(stagedData, ['version', 'entry']) || stagedData.version !== 1) {
    fail('Gallery artifact data schema is invalid.');
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

  if (
    stagedFileNames.size !== expectedFiles.size ||
    [...stagedFileNames].some((file) => !expectedFiles.has(file))
  ) {
    fail('Gallery artifact contains missing or unexpected files.');
  }

  for (const file of stagedFiles.filter((candidate) => candidate.relativePath.endsWith('.webp'))) {
    if (file.stats.size < 12) fail(`Sanitized image has invalid size: ${file.relativePath}`);
    const handle = await fs.open(file.absolutePath, 'r');
    const signature = Buffer.alloc(12);
    await handle.read(signature, 0, signature.length, 0);
    await handle.close();
    if (signature.subarray(0, 4).toString('ascii') !== 'RIFF' || signature.subarray(8, 12).toString('ascii') !== 'WEBP') {
      fail(`Sanitized image has an invalid WebP signature: ${file.relativePath}`);
    }
  }

  for (const file of stagedFiles.filter((candidate) => candidate.relativePath.endsWith('.mp4'))) {
    if (file.stats.size < 12) fail(`Sanitized video has invalid size: ${file.relativePath}`);
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

  await writeJsonAtomically(gallerySourcePath, {
    version: 1,
    entries: [entry, ...sourceData.entries]
  });
  console.log(`Verified and staged gallery publication ${submissionId}.`);
}
