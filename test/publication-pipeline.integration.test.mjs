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
    'content-creators.mjs',
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

async function writeCreatorFixtures(temporaryRoot, creatorId = 'member-1111111111111111', name = 'Old Main') {
  const body = 'A complete existing article body used to verify safe creator mutations. '.repeat(3).trim();
  const fixtures = [
    ['blog-posts.json', {
      version: 1,
      posts: [{
        id: submissionId,
        title: 'Existing article',
        excerpt: 'A complete existing summary for creator operation integration coverage.',
        body,
        content: [{ type: 'text', text: body }],
        category: 'community',
        author: name,
        creatorId,
        submittedAt: '2026-07-28T10:00:00.000Z',
        publishedAt: '2026-07-28T11:00:00.000Z',
        updatedAt: '2026-07-28T11:00:00.000Z',
        visible: true,
        readingMinutes: 1,
        views: 0,
        leadersSelection: false,
        media: []
      }]
    }],
    ['art-entries.json', {
      version: 1,
      entries: [{
        id: 'WS-BCDEFGHJ',
        title: 'Existing artwork',
        credit: name,
        creatorId
      }]
    }],
    ['community-media.json', {
      version: 1,
      entries: [{
        id: 'WS-CDEFGHJK',
        title: 'Existing capture',
        credit: name,
        creatorId
      }]
    }],
    ['roleplay-stories.json', {
      version: 1,
      stories: [{
        id: 'RP-DEFGHJKL',
        title: 'Existing chronicle',
        author: name,
        creatorId
      }]
    }]
  ];

  await Promise.all(fixtures.map(([file, data]) => fs.writeFile(
    path.join(temporaryRoot, 'data', file),
    `${JSON.stringify(data, null, 2)}\n`
  )));
}

async function appendCreatorFixtures(temporaryRoot, creatorId, name) {
  const additions = [
    ['blog-posts.json', 'posts', {
      id: 'WS-JKLMNPQR',
      title: 'Existing target article',
      author: name,
      creatorId
    }],
    ['art-entries.json', 'entries', {
      id: 'WS-KLMNPQRS',
      title: 'Existing target artwork',
      credit: name,
      creatorId
    }],
    ['community-media.json', 'entries', {
      id: 'WS-LMNPQRST',
      title: 'Existing target capture',
      credit: name,
      creatorId
    }],
    ['roleplay-stories.json', 'stories', {
      id: 'RP-MNPQRSTU',
      title: 'Existing target chronicle',
      author: name,
      creatorId
    }]
  ];

  await Promise.all(additions.map(async ([file, listKey, entry]) => {
    const filePath = path.join(temporaryRoot, 'data', file);
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    data[listKey].push(entry);
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
  }));
}

async function readCreatorCollections(temporaryRoot) {
  const [blog, art, gallery, roleplay] = await Promise.all([
    'blog-posts.json',
    'art-entries.json',
    'community-media.json',
    'roleplay-stories.json'
  ].map((file) => fs.readFile(path.join(temporaryRoot, 'data', file), 'utf8').then(JSON.parse)));
  return {
    blog: blog.posts,
    art: art.entries,
    gallery: gallery.entries,
    roleplay: roleplay.stories
  };
}

async function readCreatorEntries(temporaryRoot) {
  const [blog, art, gallery, roleplay] = await Promise.all([
    'blog-posts.json',
    'art-entries.json',
    'community-media.json',
    'roleplay-stories.json'
  ].map((file) => fs.readFile(path.join(temporaryRoot, 'data', file), 'utf8').then(JSON.parse)));
  return [
    blog.posts[0],
    art.entries[0],
    gallery.entries[0],
    roleplay.stories[0]
  ];
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

test('publisher assigns uncredited community content to Lumina', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));

  await fs.writeFile(
    path.join(temporaryRoot, 'data', 'blog-posts.json'),
    `${JSON.stringify({ version: 1, posts: [] }, null, 2)}\n`
  );

  const request = payload({
    operation: 'create',
    title: 'A guild-authored chronicle',
    excerpt: 'A complete public summary of a story created together by the guild.',
    body: 'Lumina preserves the adventures its members create together. '.repeat(3).trim(),
    categoryKey: 'community'
  });
  delete request.author;

  await sanitize(temporaryRoot, request, 102);
  const operation = JSON.parse(
    await fs.readFile(
      path.join(temporaryRoot, 'publication', 'data', 'blog-operation.json'),
      'utf8'
    )
  );
  assert.equal(operation.post.author, 'Lumina');

  await verify(temporaryRoot, request.dispatchId, 102);
  const publishedBlog = JSON.parse(
    await fs.readFile(path.join(temporaryRoot, 'data', 'blog-posts.json'), 'utf8')
  );
  assert.equal(publishedBlog.posts[0].author, 'Lumina');
  assert.equal(publishedBlog.posts[0].creatorId, 'lumina');
});

test('version 6 credit_update renames one creator across all four public collections and replays safely', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await writeCreatorFixtures(temporaryRoot);

  const request = payload({
    version: 6,
    operation: 'credit_update',
    contentType: 'blog',
    creatorId: 'member-1111111111111111',
    creatorScope: 'member',
    creatorOperation: {
      version: 1,
      type: 'rename',
      scope: 'all',
      sourceCreatorId: 'member-1111111111111111',
      targetCreatorId: 'member-1111111111111111',
      targetScope: 'member',
      targetName: 'New Main'
    }
  });

  await sanitize(temporaryRoot, request, 103);
  await verify(temporaryRoot, request.dispatchId, 103);
  const entries = await readCreatorEntries(temporaryRoot);
  assert.deepEqual(entries.map((entry) => entry.creatorId), Array(4).fill('member-1111111111111111'));
  assert.deepEqual(
    [entries[0].author, entries[1].credit, entries[2].credit, entries[3].author],
    Array(4).fill('New Main')
  );

  await verify(temporaryRoot, request.dispatchId, 103);
  const replayedEntries = await readCreatorEntries(temporaryRoot);
  assert.deepEqual(replayedEntries, entries);
});

test('version 6 transfer can move only its scoped submission to Lumina', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await writeCreatorFixtures(temporaryRoot);

  const request = payload({
    version: 6,
    operation: 'credit_update',
    contentType: 'blog',
    creatorId: 'lumina',
    creatorScope: 'guild',
    creatorOperation: {
      version: 1,
      type: 'transfer',
      scope: 'submission',
      submissionId,
      contentType: 'blog',
      sourceCreatorId: 'member-1111111111111111',
      targetCreatorId: 'lumina',
      targetScope: 'guild',
      targetName: 'Lumina'
    }
  });

  await sanitize(temporaryRoot, request, 104);
  await verify(temporaryRoot, request.dispatchId, 104);
  const entries = await readCreatorEntries(temporaryRoot);
  assert.equal(entries[0].creatorId, 'lumina');
  assert.equal(entries[0].author, 'Lumina');
  assert.deepEqual(entries.slice(1).map((entry) => entry.creatorId), Array(3).fill('member-1111111111111111'));
});

test('version 6 transfer can assign a Lumina-owned submission to an opaque member creator', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await writeCreatorFixtures(temporaryRoot, 'lumina', 'Lumina');

  const request = payload({
    version: 6,
    operation: 'credit_update',
    contentType: 'blog',
    creatorId: 'member-2222222222222222',
    creatorScope: 'member',
    creatorOperation: {
      version: 1,
      type: 'transfer',
      scope: 'submission',
      submissionId,
      contentType: 'blog',
      sourceCreatorId: 'lumina',
      targetCreatorId: 'member-2222222222222222',
      targetScope: 'member',
      targetName: 'Assigned Main'
    }
  });

  await sanitize(temporaryRoot, request, 108);
  await verify(temporaryRoot, request.dispatchId, 108);
  const entries = await readCreatorEntries(temporaryRoot);
  assert.equal(entries[0].creatorId, 'member-2222222222222222');
  assert.equal(entries[0].author, 'Assigned Main');
  assert.deepEqual(entries.slice(1).map((entry) => entry.creatorId), Array(3).fill('lumina'));
});

test('version 6 transfer with all scope moves every source publication to its new owner', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await writeCreatorFixtures(temporaryRoot);

  const request = payload({
    version: 6,
    operation: 'credit_update',
    contentType: 'art',
    creatorId: 'member-2222222222222222',
    creatorScope: 'member',
    creatorOperation: {
      version: 1,
      type: 'transfer',
      scope: 'all',
      sourceCreatorId: 'member-1111111111111111',
      targetCreatorId: 'member-2222222222222222',
      targetScope: 'member',
      targetName: 'Transferred Main'
    }
  });

  await sanitize(temporaryRoot, request, 107);
  await verify(temporaryRoot, request.dispatchId, 107);
  const entries = await readCreatorEntries(temporaryRoot);
  assert.deepEqual(entries.map((entry) => entry.creatorId), Array(4).fill('member-2222222222222222'));
  assert.deepEqual(
    [entries[0].author, entries[1].credit, entries[2].credit, entries[3].author],
    Array(4).fill('Transferred Main')
  );
});

test('normal version 6 update applies its creator rename atomically after preserving source ownership', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await writeCreatorFixtures(temporaryRoot);
  const body = 'The updated article body remains complete while its approved creator alias changes. '.repeat(3).trim();

  const request = payload({
    version: 6,
    operation: 'update',
    contentType: 'blog',
    title: 'Updated existing article',
    excerpt: 'An updated and complete summary for atomic creator operation coverage.',
    body,
    contentBlocks: [{ type: 'text', text: body }],
    categoryKey: 'community',
    author: 'New Main',
    creatorId: 'member-1111111111111111',
    creatorScope: 'member',
    creatorOperation: {
      version: 1,
      type: 'rename',
      scope: 'all',
      sourceCreatorId: 'member-1111111111111111',
      targetCreatorId: 'member-1111111111111111',
      targetScope: 'member',
      targetName: 'New Main'
    }
  });

  await sanitize(temporaryRoot, request, 105);
  await verify(temporaryRoot, request.dispatchId, 105);
  const entries = await readCreatorEntries(temporaryRoot);
  assert.equal(entries[0].title, 'Updated existing article');
  assert.deepEqual(
    [entries[0].author, entries[1].credit, entries[2].credit, entries[3].author],
    Array(4).fill('New Main')
  );
});

test('normal version 6 update cannot change stable ownership without a creator operation', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await writeCreatorFixtures(temporaryRoot);
  const body = 'The article remains otherwise valid while attempting an unapproved ownership change. '.repeat(3).trim();

  const request = payload({
    version: 6,
    operation: 'update',
    contentType: 'blog',
    title: 'Updated existing article',
    excerpt: 'A complete summary for rejecting an implicit ownership transfer.',
    body,
    contentBlocks: [{ type: 'text', text: body }],
    categoryKey: 'community',
    author: 'Different Owner',
    creatorId: 'member-2222222222222222',
    creatorScope: 'member'
  });

  await assert.rejects(
    sanitize(temporaryRoot, request, 109),
    /ownership cannot change without a creator operation/
  );
});

test('creator operations reject an implicit transfer from the wrong source owner', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await writeCreatorFixtures(temporaryRoot);

  const request = payload({
    version: 6,
    operation: 'credit_update',
    contentType: 'blog',
    creatorId: 'lumina',
    creatorScope: 'guild',
    creatorOperation: {
      version: 1,
      type: 'transfer',
      scope: 'submission',
      submissionId,
      contentType: 'blog',
      sourceCreatorId: 'member-9999999999999999',
      targetCreatorId: 'lumina',
      targetScope: 'guild',
      targetName: 'Lumina'
    }
  });

  await sanitize(temporaryRoot, request, 106);
  await assert.rejects(
    verify(temporaryRoot, request.dispatchId, 106),
    /source does not own the scoped submission/
  );
});

test('scoped transfer harmonizes every pre-existing target alias without moving unrelated source publications', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const sourceCreatorId = 'member-1111111111111111';
  const targetCreatorId = 'member-2222222222222222';
  await writeCreatorFixtures(temporaryRoot, sourceCreatorId, 'Old Main');
  await appendCreatorFixtures(temporaryRoot, targetCreatorId, 'Previous Target Alias');

  const request = payload({
    version: 6,
    operation: 'credit_update',
    contentType: 'blog',
    creatorId: targetCreatorId,
    creatorScope: 'member',
    creatorOperation: {
      version: 1,
      type: 'transfer',
      scope: 'submission',
      submissionId,
      contentType: 'blog',
      sourceCreatorId,
      targetCreatorId,
      targetScope: 'member',
      targetName: 'Target Main'
    }
  });

  await sanitize(temporaryRoot, request, 110);
  await verify(temporaryRoot, request.dispatchId, 110);
  const collections = await readCreatorCollections(temporaryRoot);

  assert.equal(collections.blog[0].creatorId, targetCreatorId);
  assert.equal(collections.blog[0].author, 'Target Main');
  assert.equal(collections.art[0].creatorId, sourceCreatorId);
  assert.equal(collections.art[0].credit, 'Old Main');
  assert.equal(collections.gallery[0].creatorId, sourceCreatorId);
  assert.equal(collections.gallery[0].credit, 'Old Main');
  assert.equal(collections.roleplay[0].creatorId, sourceCreatorId);
  assert.equal(collections.roleplay[0].author, 'Old Main');

  for (const [type, entries] of Object.entries(collections)) {
    const creditField = type === 'blog' || type === 'roleplay' ? 'author' : 'credit';
    const targetEntries = entries.filter((entry) => entry.creatorId === targetCreatorId);
    assert.ok(targetEntries.length >= 1);
    assert.deepEqual(targetEntries.map((entry) => entry[creditField]), Array(targetEntries.length).fill('Target Main'));
  }
});

test('version 6 create and update reject an alias change without a creator operation', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const creatorId = 'member-1111111111111111';
  await writeCreatorFixtures(temporaryRoot, creatorId, 'Old Main');
  const body = 'A complete article body that keeps ownership stable while testing the global creator alias invariant. '.repeat(3).trim();
  const common = {
    version: 6,
    contentType: 'blog',
    title: 'Alias invariant coverage',
    excerpt: 'A complete public summary used to enforce one approved alias per creator.',
    body,
    contentBlocks: [{ type: 'text', text: body }],
    categoryKey: 'community',
    author: 'Unapproved Alias',
    creatorId,
    creatorScope: 'member',
    attachments: []
  };

  await assert.rejects(
    sanitize(temporaryRoot, payload({ ...common, operation: 'update' }), 111),
    /creator alias differs from existing publications/
  );

  await fs.writeFile(
    path.join(temporaryRoot, 'data', 'blog-posts.json'),
    `${JSON.stringify({ version: 1, posts: [] }, null, 2)}\n`
  );
  await assert.rejects(
    sanitize(temporaryRoot, payload({ ...common, operation: 'create' }), 112),
    /creator alias differs from existing publications/
  );
});

test('version 6 alias validation ignores inconsistent creators outside the touched identity', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await Promise.all([
    fs.writeFile(
      path.join(temporaryRoot, 'data', 'blog-posts.json'),
      `${JSON.stringify({ version: 1, posts: [] }, null, 2)}\n`
    ),
    fs.writeFile(
      path.join(temporaryRoot, 'data', 'art-entries.json'),
      `${JSON.stringify({
        version: 1,
        entries: [{
          id: 'WS-KLMNPQRS',
          title: 'Unrelated art',
          credit: 'First Unrelated Alias',
          creatorId: 'member-9999999999999999'
        }]
      }, null, 2)}\n`
    ),
    fs.writeFile(
      path.join(temporaryRoot, 'data', 'community-media.json'),
      `${JSON.stringify({
        version: 1,
        entries: [{
          id: 'WS-LMNPQRST',
          title: 'Unrelated capture',
          credit: 'Second Unrelated Alias',
          creatorId: 'member-9999999999999999'
        }]
      }, null, 2)}\n`
    )
  ]);
  const body = 'A complete article body for a different creator that must remain publishable. '.repeat(3).trim();
  const request = payload({
    version: 6,
    operation: 'create',
    contentType: 'blog',
    title: 'Independent creator article',
    excerpt: 'A complete public summary belonging to an independent creator identity.',
    body,
    contentBlocks: [{ type: 'text', text: body }],
    categoryKey: 'community',
    author: 'Independent Main',
    creatorId: 'member-2222222222222222',
    creatorScope: 'member',
    attachments: []
  });

  await sanitize(temporaryRoot, request, 113);
  await verify(temporaryRoot, request.dispatchId, 113);
  const published = JSON.parse(
    await fs.readFile(path.join(temporaryRoot, 'data', 'blog-posts.json'), 'utf8')
  );
  assert.equal(published.posts[0].author, 'Independent Main');
});

test('version 6 verifier rechecks the touched alias against the latest repository state', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const creatorId = 'member-1111111111111111';
  await writeCreatorFixtures(temporaryRoot, creatorId, 'Old Main');
  const body = 'A complete update that is valid until another publication introduces a conflicting alias. '.repeat(3).trim();
  const request = payload({
    version: 6,
    operation: 'update',
    contentType: 'blog',
    title: 'Latest-state alias check',
    excerpt: 'A complete public summary for latest-branch alias verification.',
    body,
    contentBlocks: [{ type: 'text', text: body }],
    categoryKey: 'community',
    author: 'Old Main',
    creatorId,
    creatorScope: 'member',
    attachments: []
  });

  await sanitize(temporaryRoot, request, 114);
  const art = JSON.parse(
    await fs.readFile(path.join(temporaryRoot, 'data', 'art-entries.json'), 'utf8')
  );
  art.entries[0].credit = 'Racing Alias';
  await fs.writeFile(
    path.join(temporaryRoot, 'data', 'art-entries.json'),
    `${JSON.stringify(art, null, 2)}\n`
  );

  await assert.rejects(
    verify(temporaryRoot, request.dispatchId, 114),
    /creator alias differs from existing publications/
  );
});

test('version 6 creator operation rejects mismatched root target identity fields', async (t) => {
  const temporaryRoot = await prepareRepository();
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  await writeCreatorFixtures(temporaryRoot);
  const creatorOperation = {
    version: 1,
    type: 'transfer',
    scope: 'all',
    sourceCreatorId: 'member-1111111111111111',
    targetCreatorId: 'member-2222222222222222',
    targetScope: 'member',
    targetName: 'Target Main'
  };

  await assert.rejects(
    sanitize(temporaryRoot, payload({
      version: 6,
      operation: 'credit_update',
      contentType: 'blog',
      creatorId: 'member-3333333333333333',
      creatorScope: 'member',
      creatorOperation
    }), 115),
    /creator identity must match its creator operation target/
  );

  await assert.rejects(
    sanitize(temporaryRoot, payload({
      version: 6,
      operation: 'credit_update',
      contentType: 'blog',
      creatorId: 'lumina',
      creatorScope: 'guild',
      creatorOperation
    }), 116),
    /creator identity must match its creator operation target/
  );
});
