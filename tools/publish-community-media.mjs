import { createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDataPath = path.join(root, 'data', 'community-media.json');
const sourceBlogDataPath = path.join(root, 'data', 'blog-posts.json');
const configuredOutputDirectory = String(process.env.PUBLICATION_OUTPUT_DIR || '.').trim();
const outputRoot = path.resolve(root, configuredOutputDirectory);
const outputGalleryDataPath = path.join(outputRoot, 'data', 'community-media-entry.json');
const outputBlogOperationPath = path.join(outputRoot, 'data', 'blog-operation.json');
const mediaDirectory = path.join(outputRoot, 'assets', 'community');
const maximumAttachments = 4;
const maximumBlogBodyLength = 12_000;
const maximumBlogContentBlocks = 100;
const maximumAttachmentBytes = 10 * 1024 * 1024;
const maximumTotalBytes = 25 * 1024 * 1024;
const maximumInputPixels = 40_000_000;
const maximumVideoDurationSeconds = 120;
const maximumVideoWidth = 1920;
const maximumVideoHeight = 1920;
const allowedDiscordHosts = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const allowedContentTypes = new Set(['image/jpeg', 'image/png', 'video/mp4']);

if (outputRoot !== root && !outputRoot.startsWith(`${root}${path.sep}`)) {
  throw new Error('PUBLICATION_OUTPUT_DIR must remain inside the checked-out repository.');
}

function fail(message) {
  throw new Error(message);
}

function decodeSecret(value) {
  const text = String(value || '').trim();
  const key = /^[a-f0-9]{64}$/i.test(text)
    ? Buffer.from(text, 'hex')
    : Buffer.from(text, 'base64');

  if (key.length !== 32) {
    fail('WEBSITE_PUBLISH_PAYLOAD_SECRET must decode to exactly 32 bytes.');
  }

  return key;
}

function decryptPayload(value, secret) {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = String(value || '').split('.');

  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext || extra.length > 0) {
    fail('Encrypted publication payload has an invalid envelope.');
  }

  const iv = Buffer.from(encodedIv, 'base64url');
  const tag = Buffer.from(encodedTag, 'base64url');
  const ciphertext = Buffer.from(encodedCiphertext, 'base64url');

  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0 || ciphertext.length > 48_000) {
    fail('Encrypted publication payload has invalid bounds.');
  }

  const decipher = createDecipheriv('aes-256-gcm', decodeSecret(secret), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  if (plaintext.length > 36_000) {
    fail('Decrypted publication payload is too large.');
  }

  return JSON.parse(plaintext.toString('utf8'));
}

function cleanSingleLine(value, maximumLength, label) {
  const text = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text || text.length > maximumLength) {
    fail(`${label} is missing or exceeds ${maximumLength} characters.`);
  }

  return text;
}

function cleanMultiline(value, maximumLength, label) {
  const text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();

  if (!text || text.length > maximumLength) {
    fail(`${label} is missing or exceeds ${maximumLength} characters.`);
  }

  return text;
}

function validateDiscordAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') {
    fail('Attachment metadata is invalid.');
  }

  const url = new URL(String(attachment.url || ''));
  const contentType = String(attachment.contentType || '').toLowerCase();
  const size = Number(attachment.size);

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    !allowedDiscordHosts.has(url.hostname.toLowerCase()) ||
    !/^\/attachments\/\d+\/\d+\//.test(url.pathname)
  ) {
    fail('Attachment URL is not an approved Discord CDN attachment.');
  }

  if (!allowedContentTypes.has(contentType)) {
    fail('Attachment metadata contains a blocked media type.');
  }

  if (!Number.isSafeInteger(size) || size <= 0 || size > maximumAttachmentBytes) {
    fail('Attachment metadata contains an invalid file size.');
  }

  return {
    url: url.toString(),
    contentType,
    size,
    altText: cleanSingleLine(attachment.altText || 'Approved website media', 300, 'Attachment alternative text')
  };
}

function detectMediaType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }

  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'video/mp4';
  }

  return null;
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const maximumOutputBytes = 1024 * 1024;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maximumOutputBytes) {
        child.kill('SIGKILL');
        finish(reject, new Error(`${command} exceeded its output limit.`));
        return;
      }
      target.push(chunk);
    };

    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', (error) => finish(reject, error));
    child.on('close', (code) => {
      if (code !== 0) {
        finish(reject, new Error(`${command} failed: ${Buffer.concat(stderr).toString('utf8').slice(0, 500)}`));
        return;
      }

      finish(resolve, Buffer.concat(stdout).toString('utf8'));
    });
  });
}

async function probeVideo(filePath) {
  const output = await runCommand('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height',
    '-of', 'json',
    filePath
  ]);
  const probe = JSON.parse(output);
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const videoStreams = streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
  const blockedStreams = streams.filter((stream) => !['video', 'audio'].includes(stream.codec_type));
  const video = videoStreams[0];
  const duration = Number(probe.format?.duration);

  if (
    videoStreams.length !== 1 ||
    audioStreams.length > 1 ||
    blockedStreams.length > 0 ||
    video?.codec_name !== 'h264' ||
    (audioStreams[0] && audioStreams[0].codec_name !== 'aac') ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > maximumVideoDurationSeconds ||
    !Number.isSafeInteger(video?.width) ||
    !Number.isSafeInteger(video?.height) ||
    video.width < 1 ||
    video.height < 1 ||
    video.width > 3840 ||
    video.height > 3840
  ) {
    fail('MP4 must contain one H.264 video stream, optional AAC audio, safe dimensions and at most 120 seconds.');
  }

  return {
    duration,
    width: video.width,
    height: video.height
  };
}

async function sanitizeVideo(input, outputPath) {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'luminox-media-'));
  const inputPath = path.join(temporaryDirectory, 'input.mp4');

  try {
    await fs.writeFile(inputPath, input, { flag: 'wx' });
    await probeVideo(inputPath);
    await runCommand('ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-dn',
      '-sn',
      '-map_metadata', '-1',
      '-map_chapters', '-1',
      '-vf', `scale=w='min(${maximumVideoWidth},iw)':h='min(${maximumVideoHeight},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-ar', '48000',
      '-movflags', '+faststart',
      '-t', String(maximumVideoDurationSeconds),
      '-n',
      outputPath
    ]);
    const metadata = await probeVideo(outputPath);
    const stats = await fs.stat(outputPath);

    if (stats.size <= 0 || stats.size > maximumAttachmentBytes) {
      fail('Sanitized MP4 exceeds the maximum allowed size.');
    }

    return metadata;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function readBoundedBody(response, maximumBytes) {
  if (!response.body) {
    fail('Discord returned an empty attachment response.');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maximumBytes) {
      await reader.cancel();
      fail('Discord attachment exceeded the hard download limit.');
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, totalBytes);
}

async function downloadAttachment(attachment) {
  const response = await fetch(attachment.url, {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: attachment.contentType,
      'User-Agent': 'Luminox-GitHub-Media-Sanitizer/1.0'
    }
  });

  if (!response.ok) {
    await response.body?.cancel();
    fail(`Discord attachment download failed with HTTP ${response.status}.`);
  }

  const responseType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const declaredLength = Number(response.headers.get('content-length'));

  if (!allowedContentTypes.has(responseType)) {
    await response.body?.cancel();
    fail('Discord returned a blocked attachment content type.');
  }

  if (Number.isFinite(declaredLength) && declaredLength > maximumAttachmentBytes) {
    await response.body?.cancel();
    fail('Discord attachment exceeds the maximum allowed size.');
  }

  const input = await readBoundedBody(response, maximumAttachmentBytes);
  const detectedType = detectMediaType(input);

  if (!detectedType || detectedType !== responseType || detectedType !== attachment.contentType) {
    fail('Attachment signature does not match its declared media type.');
  }

  return {
    input,
    contentType: detectedType
  };
}

async function loadGalleryData() {
  try {
    const parsed = JSON.parse(await fs.readFile(sourceDataPath, 'utf8'));

    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      fail('Community media data file has an invalid schema.');
    }

    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: 1, entries: [] };
    }

    throw error;
  }
}

async function loadBlogData() {
  try {
    const parsed = JSON.parse(await fs.readFile(sourceBlogDataPath, 'utf8'));

    if (parsed?.version !== 1 || !Array.isArray(parsed.posts)) {
      fail('Blog data file has an invalid schema.');
    }

    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: 1, posts: [] };
    }

    throw error;
  }
}

const expectedSubmissionId = cleanSingleLine(process.env.SUBMISSION_ID, 32, 'Submission ID');

if (!/^WS-[A-Z2-9]{8}$/.test(expectedSubmissionId)) {
  fail('Submission ID has an invalid format.');
}

const payload = decryptPayload(process.env.ENCRYPTED_PAYLOAD, process.env.PUBLISH_PAYLOAD_SECRET);

if (![1, 2, 3].includes(payload?.version) || payload.submissionId !== expectedSubmissionId) {
  fail('Encrypted payload does not match the requested submission.');
}

const contentType = cleanSingleLine(payload.contentType || 'gallery', 20, 'Content type');
const operation = cleanSingleLine(payload.operation || 'create', 30, 'Publication operation');

if (!['gallery', 'blog'].includes(contentType)) {
  fail('Encrypted payload contains an unsupported publication type.');
}

const title = cleanSingleLine(payload.title, 100, 'Title');
const submittedAt = new Date(payload.submittedAt);

if (Number.isNaN(submittedAt.getTime()) || submittedAt.getTime() > Date.now() + 60_000) {
  fail('Submission date is invalid.');
}

if (contentType === 'blog') {
  if (!['create', 'update', 'hide', 'unhide', 'delete', 'hide_for_changes'].includes(operation)) {
    fail('Blog publication operation is not supported.');
  }

  const blogData = await loadBlogData();
  const existingPost = blogData.posts.find((post) => post.id === expectedSubmissionId) || null;

  if (operation === 'create' && existingPost) {
    fail('This blog submission is already published.');
  }

  if (operation !== 'create' && !existingPost) {
    fail('The requested blog article does not exist.');
  }

  let blogPost = null;

  if (['create', 'update'].includes(operation)) {
    const excerpt = cleanMultiline(payload.excerpt, 300, 'Excerpt');
    const body = cleanMultiline(payload.body, maximumBlogBodyLength, 'Article body');
    const category = cleanSingleLine(payload.category, 50, 'Category');
    const author = cleanSingleLine(payload.author, 100, 'Author');

    if (excerpt.length < 20 || body.length < 100 || category.length < 2) {
      fail('Blog publication fields are below their minimum length.');
    }

    if (!Array.isArray(payload.attachments) || payload.attachments.length > maximumAttachments) {
      fail(`Blog payload can contain at most ${maximumAttachments} image attachments.`);
    }

    const attachments = payload.attachments.map(validateDiscordAttachment);

    if (attachments.some((attachment) => !['image/jpeg', 'image/png'].includes(attachment.contentType))) {
      fail('Blog publications accept only JPG and PNG images.');
    }

    const declaredTotalBytes = attachments.reduce((sum, attachment) => sum + attachment.size, 0);

    if (declaredTotalBytes > maximumTotalBytes) {
      fail('Blog images exceed the maximum combined size.');
    }

    await fs.mkdir(mediaDirectory, { recursive: true });
    const publishedMedia = [];

    for (const [index, attachment] of attachments.entries()) {
      const downloaded = await downloadAttachment(attachment);
      const outputName = `${expectedSubmissionId.toLowerCase()}-blog-${index + 1}.webp`;
      const outputPath = path.join(mediaDirectory, outputName);
      const { data, info } = await sharp(downloaded.input, {
        failOn: 'warning',
        limitInputPixels: maximumInputPixels,
        sequentialRead: true
      })
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({
          quality: 86,
          effort: 4,
          smartSubsample: true
        })
        .toBuffer({ resolveWithObject: true });

      if (info.width < 1 || info.height < 1 || info.width * info.height > maximumInputPixels) {
        fail('Sanitized Blog image dimensions are invalid.');
      }

      await fs.writeFile(outputPath, data, { flag: 'wx' });
      publishedMedia.push({
        type: 'image',
        src: `assets/community/${outputName}`,
        alt: cleanSingleLine(attachment.altText || title, 300, 'Blog image alternative text'),
        width: info.width,
        height: info.height
      });
    }

    const requestedContent = Array.isArray(payload.contentBlocks) ? payload.contentBlocks : [];
    const publishedContent = [];

    if (requestedContent.length > maximumBlogContentBlocks) {
      fail(`Blog content can contain at most ${maximumBlogContentBlocks} ordered blocks.`);
    }

    for (const block of requestedContent) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        fail('Blog content contains an invalid block.');
      }

      if (block.type === 'text') {
        publishedContent.push({
          type: 'text',
          text: cleanMultiline(block.text, maximumBlogBodyLength, 'Blog text block')
        });
        continue;
      }

      if (block.type === 'image') {
        const mediaIndex = Number(block.attachmentIndex);

        if (!Number.isSafeInteger(mediaIndex) || mediaIndex < 0 || mediaIndex >= publishedMedia.length) {
          fail('Blog content references an invalid image.');
        }

        publishedContent.push({ type: 'image', mediaIndex });
        continue;
      }

      fail('Blog content contains an unsupported block type.');
    }

    if (publishedContent.length === 0) {
      publishedContent.push(
        { type: 'text', text: body },
        ...publishedMedia.map((_, mediaIndex) => ({ type: 'image', mediaIndex }))
      );
    }

    const contentText = publishedContent
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');
    const referencedImages = publishedContent
      .filter((block) => block.type === 'image')
      .map((block) => block.mediaIndex);

    if (contentText !== body) {
      fail('Ordered Blog text does not match the approved article body.');
    }

    if (
      referencedImages.length !== publishedMedia.length ||
      new Set(referencedImages).size !== publishedMedia.length ||
      referencedImages.some((mediaIndex) => mediaIndex < 0 || mediaIndex >= publishedMedia.length)
    ) {
      fail('Every approved Blog image must appear exactly once in the ordered article content.');
    }

    const operationAt = new Date().toISOString();
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    blogPost = {
      id: expectedSubmissionId,
      title,
      excerpt,
      body,
      content: publishedContent,
      category,
      author,
      submittedAt: existingPost?.submittedAt || submittedAt.toISOString(),
      publishedAt: existingPost?.publishedAt || operationAt,
      updatedAt: operationAt,
      visible: existingPost ? existingPost.visible !== false : true,
      readingMinutes: Math.max(1, Math.min(60, Math.ceil(wordCount / 220))),
      views: existingPost?.views ?? 0,
      leadersSelection: existingPost?.leadersSelection === true,
      media: publishedMedia
    };
  } else if (!Array.isArray(payload.attachments) || payload.attachments.length !== 0) {
    fail('This Blog management operation cannot contain attachments.');
  }

  const blogOperation = {
    version: 1,
    operation,
    submissionId: expectedSubmissionId,
    operationAt: new Date().toISOString(),
    post: blogPost
  };

  await fs.mkdir(path.dirname(outputBlogOperationPath), { recursive: true });
  await fs.writeFile(outputBlogOperationPath, `${JSON.stringify(blogOperation, null, 2)}\n`, 'utf8');
  console.log(`Validated Blog ${operation} operation for ${expectedSubmissionId}.`);
} else {
  if (operation !== 'create') {
    fail('Gallery entries support only the create operation.');
  }
  const description = cleanMultiline(payload.description, 1200, 'Description');
  const altText = cleanSingleLine(payload.altText, 300, 'Alternative text');
  const credit = cleanSingleLine(payload.credit, 100, 'Credit');

  if (!Array.isArray(payload.attachments) || payload.attachments.length < 1 || payload.attachments.length > maximumAttachments) {
    fail(`Payload must contain between 1 and ${maximumAttachments} attachments.`);
  }

  const attachments = payload.attachments.map(validateDiscordAttachment);
  const declaredTotalBytes = attachments.reduce((sum, attachment) => sum + attachment.size, 0);

  if (declaredTotalBytes > maximumTotalBytes) {
    fail('Submission exceeds the maximum combined attachment size.');
  }

  const galleryData = await loadGalleryData();

  if (galleryData.entries.some((entry) => entry.id === expectedSubmissionId)) {
    fail('This submission is already published.');
  }

  await fs.mkdir(mediaDirectory, { recursive: true });
  await fs.mkdir(path.dirname(outputGalleryDataPath), { recursive: true });

  const publishedMedia = [];

  for (const [index, attachment] of attachments.entries()) {
    const downloaded = await downloadAttachment(attachment);
    const isVideo = downloaded.contentType === 'video/mp4';
    const outputName = `${expectedSubmissionId.toLowerCase()}-${index + 1}.${isVideo ? 'mp4' : 'webp'}`;
    const outputPath = path.join(mediaDirectory, outputName);

    if (isVideo) {
      const metadata = await sanitizeVideo(downloaded.input, outputPath);
      publishedMedia.push({
        type: 'video',
        src: `assets/community/${outputName}`,
        alt: altText,
        width: metadata.width,
        height: metadata.height,
        duration: Number(metadata.duration.toFixed(3))
      });
      continue;
    }

    const { data, info } = await sharp(downloaded.input, {
      failOn: 'warning',
      limitInputPixels: maximumInputPixels,
      sequentialRead: true
    })
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({
        quality: 86,
        effort: 4,
        smartSubsample: true
      })
      .toBuffer({ resolveWithObject: true });

    if (info.width < 1 || info.height < 1 || info.width * info.height > maximumInputPixels) {
      fail('Sanitized image dimensions are invalid.');
    }

    await fs.writeFile(outputPath, data, { flag: 'wx' });
    publishedMedia.push({
      type: 'image',
      src: `assets/community/${outputName}`,
      alt: altText,
      width: info.width,
      height: info.height
    });
  }

  const galleryEntry = {
    id: expectedSubmissionId,
    title,
    description,
    credit,
    submittedAt: submittedAt.toISOString(),
    publishedAt: new Date().toISOString(),
    media: publishedMedia
  };

  await fs.writeFile(outputGalleryDataPath, `${JSON.stringify({ version: 1, entry: galleryEntry }, null, 2)}\n`, 'utf8');
  console.log(`Sanitized ${publishedMedia.length} approved media file(s) for ${expectedSubmissionId}.`);
}
