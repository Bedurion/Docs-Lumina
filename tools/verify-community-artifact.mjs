import fs from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingRoot = path.resolve(root, process.argv[2] || 'publication');
const submissionId = String(process.argv[3] || '').trim();
const gallerySourcePath = path.join(root, 'data', 'community-media.json');
const blogSourcePath = path.join(root, 'data', 'blog-posts.json');
const artSourcePath = path.join(root, 'data', 'art-entries.json');
const roleplaySourcePath = path.join(root, 'data', 'roleplay-stories.json');
const stagedGalleryPath = path.join(stagingRoot, 'data', 'community-media-entry.json');
const stagedBlogOperationPath = path.join(stagingRoot, 'data', 'blog-operation.json');
const stagedArtPath = path.join(stagingRoot, 'data', 'art-entry.json');
const stagedRoleplayOperationPath = path.join(stagingRoot, 'data', 'roleplay-operation.json');
const maximumArtifactBytes = 10 * 1024 * 1024;
const maximumDataBytes = 10 * 1024 * 1024;
const artCategories = new Set(['places', 'heroes', 'creatures', 'adversaries', 'guild-life']);
const roleplayCategories = new Set(['campaign', 'one-shot', 'character', 'lore']);
const roleplayStatuses = new Set(['ongoing', 'complete']);

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
const hasArtArtifact = stagedFileNames.has('data/art-entry.json');
const hasRoleplayArtifact = stagedFileNames.has('data/roleplay-operation.json');

if ([hasGalleryArtifact, hasBlogArtifact, hasArtArtifact, hasRoleplayArtifact].filter(Boolean).length !== 1) {
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
      'leadersSelection', 'media', 'content'
    ];

    if (!isPlainObject(post) || !hasOnlyKeys(post, postKeys) || post.id !== submissionId) {
      fail('Blog post contains an invalid structure.');
    }

    assertString(post.title, 3, 100, 'Blog title');
    assertString(post.excerpt, 20, 300, 'Blog excerpt');
    assertString(post.body, 100, 12_000, 'Blog body');
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

    if (!Array.isArray(post.content) || post.content.length < 1 || post.content.length > 100) {
      fail('Blog content must contain between one and 100 ordered blocks.');
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

    const textBlocks = [];
    const referencedImages = [];

    for (const block of post.content) {
      if (!isPlainObject(block)) fail('Blog content contains an invalid block.');

      if (block.type === 'text') {
        if (!hasOnlyKeys(block, ['type', 'text'])) fail('Blog text block has an invalid structure.');
        assertString(block.text, 1, 12_000, 'Blog text block');
        textBlocks.push(block.text);
        continue;
      }

      if (block.type === 'image') {
        if (!hasOnlyKeys(block, ['type', 'mediaIndex'])) fail('Blog image block has an invalid structure.');
        if (!Number.isSafeInteger(block.mediaIndex) || block.mediaIndex < 0 || block.mediaIndex >= post.media.length) {
          fail('Blog image block references invalid media.');
        }
        referencedImages.push(block.mediaIndex);
        continue;
      }

      fail('Blog content contains an unsupported block type.');
    }

    if (textBlocks.join('\n\n') !== post.body) {
      fail('Blog ordered text does not match its approved body.');
    }

    if (
      referencedImages.length !== post.media.length ||
      new Set(referencedImages).size !== post.media.length
    ) {
      fail('Blog ordered content must reference each image exactly once.');
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
} else if (hasRoleplayArtifact) {
  const [sourceData, operationData] = await Promise.all([
    readBoundedJson(roleplaySourcePath, 'Roleplay archive data'),
    readBoundedJson(stagedRoleplayOperationPath, 'Roleplay operation data')
  ]);

  if (
    !isPlainObject(sourceData) ||
    !hasOnlyKeys(sourceData, ['version', 'stories']) ||
    sourceData.version !== 1 ||
    !Array.isArray(sourceData.stories)
  ) {
    fail('Roleplay archive data schema is invalid.');
  }

  if (
    !isPlainObject(operationData) ||
    !hasOnlyKeys(operationData, ['version', 'operation', 'submissionId', 'operationAt', 'story']) ||
    operationData.version !== 1 ||
    operationData.submissionId !== submissionId ||
    !['create', 'update', 'hide', 'unhide', 'delete', 'hide_for_changes'].includes(operationData.operation)
  ) {
    fail('Roleplay operation artifact has an invalid schema.');
  }

  assertIsoDate(operationData.operationAt, 'Roleplay operation date');
  const expectedStoryId = submissionId.replace(/^WS-/, 'RP-');
  const expectedStorySlug = expectedStoryId.toLowerCase();
  const existingIndex = sourceData.stories.findIndex((story) => story?.id === expectedStoryId);
  const requiresExisting = operationData.operation !== 'create';

  if (operationData.operation === 'create' && existingIndex >= 0) {
    fail('Roleplay story is already present in the repository.');
  }

  if (requiresExisting && existingIndex < 0) {
    fail('Roleplay operation targets a story that does not exist.');
  }

  const expectedFiles = new Set(['data/roleplay-operation.json']);
  const story = operationData.story;
  const imageSources = [];

  if (['create', 'update'].includes(operationData.operation)) {
    const storyKeys = [
      'id', 'slug', 'title', 'subtitle', 'summary', 'category', 'status',
      'featured', 'visible', 'author', 'publishedAt', 'updatedAt',
      'readingMinutes', 'cover', 'chapters'
    ];

    if (
      !isPlainObject(story) ||
      !hasOnlyKeys(story, storyKeys) ||
      story.id !== expectedStoryId ||
      story.slug !== expectedStorySlug
    ) {
      fail('Roleplay story contains an invalid structure or identity.');
    }

    assertString(story.title, 3, 120, 'Roleplay title');
    assertString(story.subtitle, 0, 180, 'Roleplay subtitle');
    assertString(story.summary, 20, 600, 'Roleplay summary');
    assertString(story.author, 1, 100, 'Roleplay author');
    assertIsoDate(story.publishedAt, 'Roleplay publication date');
    assertIsoDate(story.updatedAt, 'Roleplay update date');

    if (!roleplayCategories.has(story.category)) fail('Roleplay category is not supported.');
    if (!roleplayStatuses.has(story.status)) fail('Roleplay status is not supported.');
    if (typeof story.featured !== 'boolean' || typeof story.visible !== 'boolean') {
      fail('Roleplay publication flags must be boolean.');
    }
    if (!Number.isSafeInteger(story.readingMinutes) || story.readingMinutes < 1 || story.readingMinutes > 600) {
      fail('Roleplay reading time is invalid.');
    }
    if (!Array.isArray(story.chapters) || story.chapters.length !== 1) {
      fail('Discord-published Roleplay stories must contain exactly one chapter.');
    }

    const chapter = story.chapters[0];

    if (
      !isPlainObject(chapter) ||
      !hasOnlyKeys(chapter, ['id', 'title', 'summary', 'publishedAt', 'visible', 'content']) ||
      chapter.id !== 'chapter-one'
    ) {
      fail('Roleplay chapter contains an invalid structure.');
    }

    assertString(chapter.title, 3, 140, 'Roleplay chapter title');
    assertString(chapter.summary, 0, 400, 'Roleplay chapter summary');
    assertIsoDate(chapter.publishedAt, 'Roleplay chapter publication date');

    if (chapter.visible !== true) fail('A newly published Roleplay chapter must be visible.');
    if (!Array.isArray(chapter.content) || chapter.content.length < 1 || chapter.content.length > 200) {
      fail('Roleplay chapter must contain between one and 200 ordered blocks.');
    }

    const textBlocks = [];

    for (const block of chapter.content) {
      if (!isPlainObject(block)) fail('Roleplay chapter contains an invalid block.');

      if (block.type === 'paragraph') {
        if (!hasOnlyKeys(block, ['type', 'text'])) fail('Roleplay paragraph has an invalid structure.');
        assertString(block.text, 1, 12_000, 'Roleplay paragraph');
        textBlocks.push(block.text);
        continue;
      }

      if (block.type === 'image') {
        if (!hasOnlyKeys(block, ['type', 'src', 'alt', 'caption', 'width', 'height'])) {
          fail('Roleplay image block has an invalid structure.');
        }

        if (
          typeof block.src !== 'string' ||
          !block.src.startsWith(`assets/community/${submissionId.toLowerCase()}-roleplay-`) ||
          !/^assets\/community\/ws-[a-z2-9]{8}-roleplay-\d+\.webp$/.test(block.src)
        ) {
          fail('Roleplay image path is unsafe or unrelated to this submission.');
        }

        assertString(block.alt, 3, 300, 'Roleplay image alternative text');
        assertString(block.caption, 0, 300, 'Roleplay image caption');

        if (
          !Number.isSafeInteger(block.width) ||
          !Number.isSafeInteger(block.height) ||
          block.width < 1 ||
          block.height < 1 ||
          block.width > 2400 ||
          block.height > 2400 ||
          block.width * block.height > 40_000_000
        ) {
          fail('Roleplay image dimensions are invalid.');
        }

        imageSources.push(block.src);
        expectedFiles.add(block.src);
        continue;
      }

      fail('Discord-published Roleplay chapters support only paragraph and image blocks.');
    }

    const body = textBlocks.join('\n\n');

    if (body.length < 200 || body.length > 30_000) {
      fail('Roleplay chapter text is outside its safe publication bounds.');
    }

    if (imageSources.length > 8 || new Set(imageSources).size !== imageSources.length) {
      fail('Roleplay chapter contains too many or duplicate images.');
    }

    const expectedImageSources = new Set(
      Array.from(
        { length: imageSources.length },
        (_, index) => `assets/community/${submissionId.toLowerCase()}-roleplay-${index + 1}.webp`
      )
    );

    if (imageSources.some((source) => !expectedImageSources.has(source))) {
      fail('Roleplay chapter image sequence is incomplete or unexpected.');
    }

    if (imageSources.length === 0) {
      if (story.cover !== null) fail('Roleplay story without images cannot contain a cover.');
    } else {
      const expectedCoverSource = `assets/community/${submissionId.toLowerCase()}-roleplay-1.webp`;

      if (
        !isPlainObject(story.cover) ||
        !hasOnlyKeys(story.cover, ['src', 'alt', 'width', 'height']) ||
        story.cover.src !== expectedCoverSource
      ) {
        fail('Roleplay cover must use the first approved image.');
      }

      const coverBlock = chapter.content.find((block) => block.type === 'image' && block.src === expectedCoverSource);

      if (
        !coverBlock ||
        story.cover.alt !== coverBlock.alt ||
        story.cover.width !== coverBlock.width ||
        story.cover.height !== coverBlock.height
      ) {
        fail('Roleplay cover metadata does not match its approved chapter image.');
      }
    }
  } else if (story !== null) {
    fail('This Roleplay management operation cannot contain story content.');
  }

  if (
    stagedFileNames.size !== expectedFiles.size ||
    [...stagedFileNames].some((file) => !expectedFiles.has(file))
  ) {
    fail('Roleplay artifact contains missing or unexpected files.');
  }

  for (const file of stagedFiles.filter((candidate) => candidate.relativePath.endsWith('.webp'))) {
    if (file.stats.size < 12) fail(`Sanitized Roleplay image has invalid size: ${file.relativePath}`);
    const handle = await fs.open(file.absolutePath, 'r');
    const signature = Buffer.alloc(12);
    await handle.read(signature, 0, signature.length, 0);
    await handle.close();
    if (signature.subarray(0, 4).toString('ascii') !== 'RIFF' || signature.subarray(8, 12).toString('ascii') !== 'WEBP') {
      fail(`Sanitized Roleplay image has an invalid WebP signature: ${file.relativePath}`);
    }
  }

  const collectStoredMedia = (storedStory) => {
    const sources = new Set();

    if (storedStory?.cover?.src) sources.add(storedStory.cover.src);
    for (const chapter of storedStory?.chapters || []) {
      for (const block of chapter?.content || []) {
        if (block?.type === 'image' && block.src) sources.add(block.src);
      }
    }

    return [...sources];
  };

  const removeStoredMedia = async (storedStory) => {
    const expectedPrefix = `assets/community/${submissionId.toLowerCase()}-roleplay-`;

    for (const source of collectStoredMedia(storedStory)) {
      if (
        typeof source !== 'string' ||
        !source.startsWith(expectedPrefix) ||
        !/^assets\/community\/ws-[a-z2-9]{8}-roleplay-\d+\.webp$/.test(source)
      ) {
        fail('Stored Roleplay media path is unsafe.');
      }

      await fs.rm(path.join(root, source), { force: true });
    }
  };

  const updatedStories = [...sourceData.stories];

  if (operationData.operation === 'create') {
    updatedStories.unshift(story);
  } else if (operationData.operation === 'update') {
    await removeStoredMedia(updatedStories[existingIndex]);
    updatedStories[existingIndex] = story;
  } else if (operationData.operation === 'delete') {
    await removeStoredMedia(updatedStories[existingIndex]);
    updatedStories.splice(existingIndex, 1);
  } else {
    updatedStories[existingIndex] = {
      ...updatedStories[existingIndex],
      visible: operationData.operation === 'unhide',
      updatedAt: operationData.operationAt
    };
  }

  if (['create', 'update'].includes(operationData.operation)) {
    await fs.mkdir(path.join(root, 'assets', 'community'), { recursive: true });

    for (const source of imageSources) {
      await fs.copyFile(
        path.join(stagingRoot, source),
        path.join(root, source),
        fsConstants.COPYFILE_EXCL
      );
    }
  }

  if (updatedStories.filter((item) => item?.visible !== false && item?.featured === true).length > 1) {
    fail('Roleplay archive cannot contain more than one visible featured story.');
  }

  await writeJsonAtomically(roleplaySourcePath, {
    version: 1,
    stories: updatedStories
  });
  console.log(`Verified and applied Roleplay ${operationData.operation} operation for ${submissionId}.`);
} else if (hasArtArtifact) {
  const [sourceData, stagedData] = await Promise.all([
    readBoundedJson(artSourcePath, 'Art data'),
    readBoundedJson(stagedArtPath, 'Art artifact data')
  ]);

  if (!isPlainObject(sourceData) || !hasOnlyKeys(sourceData, ['version', 'entries']) || sourceData.version !== 1 || !Array.isArray(sourceData.entries)) {
    fail('Art data schema is invalid.');
  }
  if (sourceData.entries.some((entry) => entry?.id === submissionId)) {
    fail('Art submission is already present in the repository.');
  }
  if (!isPlainObject(stagedData) || !hasOnlyKeys(stagedData, ['version', 'entry']) || stagedData.version !== 1) {
    fail('Art artifact data schema is invalid.');
  }

  const entry = stagedData.entry;

  if (
    !isPlainObject(entry) ||
    !hasOnlyKeys(entry, [
      'id', 'title', 'description', 'category', 'credit',
      'submittedAt', 'publishedAt', 'media'
    ])
  ) {
    fail('New Art entry contains an invalid structure.');
  }

  if (entry.id !== submissionId) fail('Art entry does not match the requested submission.');
  assertString(entry.title, 3, 80, 'Art title');
  assertString(entry.description, 20, 360, 'Art description');
  assertString(entry.category, 3, 30, 'Art category');
  assertString(entry.credit, 1, 100, 'Art credit');
  assertIsoDate(entry.submittedAt, 'Art submission date');
  assertIsoDate(entry.publishedAt, 'Art publication date');

  if (!artCategories.has(entry.category)) {
    fail('Art category is not supported by the public archive.');
  }

  const media = entry.media;
  const expectedSource = `assets/community/${submissionId.toLowerCase()}-art.webp`;

  if (
    !isPlainObject(media) ||
    !hasOnlyKeys(media, ['type', 'src', 'alt', 'width', 'height']) ||
    media.type !== 'image' ||
    media.src !== expectedSource
  ) {
    fail('Art media contains an invalid structure or path.');
  }

  assertString(media.alt, 10, 300, 'Art alternative text');

  if (
    !Number.isSafeInteger(media.width) ||
    !Number.isSafeInteger(media.height) ||
    media.width < 1 ||
    media.height < 1 ||
    media.width > 2400 ||
    media.height > 2400 ||
    media.width * media.height > 40_000_000
  ) {
    fail('Art image dimensions are invalid.');
  }

  const expectedFiles = new Set(['data/art-entry.json', expectedSource]);

  if (
    stagedFileNames.size !== expectedFiles.size ||
    [...stagedFileNames].some((file) => !expectedFiles.has(file))
  ) {
    fail('Art artifact contains missing or unexpected files.');
  }

  const imageFile = stagedFiles.find((file) => file.relativePath === expectedSource);

  if (!imageFile || imageFile.stats.size < 12) {
    fail('Sanitized Art image has an invalid size.');
  }

  const handle = await fs.open(imageFile.absolutePath, 'r');
  const signature = Buffer.alloc(12);
  await handle.read(signature, 0, signature.length, 0);
  await handle.close();

  if (signature.subarray(0, 4).toString('ascii') !== 'RIFF' || signature.subarray(8, 12).toString('ascii') !== 'WEBP') {
    fail('Sanitized Art image has an invalid WebP signature.');
  }

  await fs.mkdir(path.join(root, 'assets', 'community'), { recursive: true });
  await fs.copyFile(
    path.join(stagingRoot, expectedSource),
    path.join(root, expectedSource),
    fsConstants.COPYFILE_EXCL
  );
  await writeJsonAtomically(artSourcePath, {
    version: 1,
    entries: [entry, ...sourceData.entries]
  });
  console.log(`Verified and staged Art publication ${submissionId}.`);
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
