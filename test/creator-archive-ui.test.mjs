import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadCommunityArchive(fixtures) {
  const context = {
    fetch: async (url) => ({
      ok: true,
      json: async () => fixtures[url] || {}
    }),
    window: {}
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'community-content.js'), 'utf8'),
    context,
    { filename: 'community-content.js' }
  );
  return context.window.LuminaCommunityContent.load();
}

test('community archive aggregates all formats, hides private items and preserves deep links', async () => {
  const archive = await loadCommunityArchive({
    'data/art-curated.json': {
      entries: [{
        id: 'art-moonlit-citadel',
        title: 'Moonlit Citadel',
        credit: 'Lumina',
        creatorId: 'lumina',
        media: { type: 'image', src: 'assets/art/moonlit-citadel.webp', alt: 'Citadel' }
      }]
    },
    'data/community-media.json': {
      entries: [{
        id: 'WS-GALLERY',
        title: 'Guild gathering',
        credit: 'Sacrel',
        creatorId: 'creator-sacrel',
        publishedAt: '2026-07-20T00:00:00.000Z',
        media: [{ type: 'image', src: 'assets/community/gallery.webp', alt: 'Gathering' }]
      }]
    },
    'data/blog-posts.json': {
      posts: [{
        id: 'WS-HIDDEN',
        title: 'Private draft',
        author: 'Sacrel',
        creatorId: 'creator-sacrel',
        visible: false
      }]
    },
    'data/art-entries.json': {
      entries: [{
        id: 'WS-ART',
        title: 'New artwork',
        credit: 'Sacrel',
        creatorId: 'creator-sacrel',
        publishedAt: '2026-07-21T00:00:00.000Z',
        media: { type: 'image', src: 'assets/community/art.webp', alt: 'Artwork' }
      }]
    },
    'data/roleplay-stories.json': {
      stories: [{
        id: 'WS-RP',
        slug: 'opening-story',
        title: 'Opening story',
        author: 'Legacy Character',
        publishedAt: '2026-07-19T00:00:00.000Z'
      }]
    }
  });

  assert.equal(archive.items.length, 4);
  assert.equal(archive.items.some((item) => item.id === 'WS-HIDDEN'), false);
  assert.equal(archive.items.find((item) => item.id === 'WS-GALLERY').href, 'gallery.html#ws-gallery');
  assert.equal(archive.items.find((item) => item.id === 'WS-ART').href, 'guild-art.html#ws-art');
  assert.equal(archive.items.find((item) => item.id === 'WS-RP').href, 'guild-roleplay.html#story-opening-story');

  const sacrel = archive.creators.find((creator) => creator.id === 'creator-sacrel');
  assert.equal(sacrel.total, 2);
  assert.equal(sacrel.counts.gallery, 1);
  assert.equal(sacrel.counts.art, 1);
  assert.match(
    archive.items.find((item) => item.id === 'WS-RP').creatorId,
    /^legacy-[a-f0-9]{16}$/
  );
});

test('creator pages and navigation expose the complete accessible experience', () => {
  const directory = fs.readFileSync(path.join(root, 'guild-creators.html'), 'utf8');
  const profile = fs.readFileSync(path.join(root, 'guild-creator.html'), 'utf8');
  const directoryScript = fs.readFileSync(path.join(root, 'creators.js'), 'utf8');
  const profileScript = fs.readFileSync(path.join(root, 'creator-profile.js'), 'utf8');
  const members = fs.readFileSync(path.join(root, 'guild-members.html'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  const galleryScript = fs.readFileSync(path.join(root, 'gallery.js'), 'utf8');
  const stylesheet = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

  for (const source of [directory, profile]) {
    assert.match(source, /community-content\.js/);
    assert.match(source, /data-creator/);
  }
  assert.match(directory, /data-creator-search/);
  assert.match(directory, /data-guild-creator/);
  assert.match(profile, /data-creator-publications/);
  assert.match(profile, /data-creator-primary-action/);
  assert.match(members, /href="guild-creators\.html"/);
  assert.match(navigation, /\['guild-creators\.html', 'Creators', 'Guild Life'\]/);
  assert.match(navigation, /currentPage === 'guild-creator\.html'[\s\S]*?'guild-creators\.html'/);
  assert.match(navigation, /'creator-profile': \['guild-creator\.html'\]/);
  assert.match(navigation, /dataset\.creatorFeatured = ''/);
  assert.match(profileScript, /const title = creator\.name;/);
  assert.doesNotMatch(profileScript, /Contributor archive/);
  assert.match(profileScript, /profileCreator\.items\[0\]/);
  assert.match(profileScript, /publicationMedia\(item, \{ priority: true \}\)/);
  assert.match(profileScript, /image\.fetchPriority = 'high'/);
  assert.match(profileScript, /profilePublicationsSection\.hidden = profileCreator\.total <= 1 && !archive\.partial/);
  assert.match(directoryScript, /has-\$\{images\.length\}-item/);
  assert.match(
    galleryScript,
    /function buildFeaturedEntry\(entry\)[\s\S]*?article\.id = String\(entry\.id \|\| ''\)\.toLowerCase\(\)/
  );
  assert.match(stylesheet, /\.creator-directory-grid\s*\{[\s\S]*?repeat\(3,/);
  assert.match(stylesheet, /\.creator-directory-card > a\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"thumbs"[\s\S]*?"heading"[\s\S]*?"types"[\s\S]*?"open"/);
  assert.match(stylesheet, /\.creator-thumbnail-strip\.has-1-item\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(stylesheet, /\.creator-featured-card > a\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(stylesheet, /\.creators-closing,[\s\S]*?\.creator-profile-closing\s*\{[\s\S]*?border:\s*1px solid[\s\S]*?border-radius:/);
  assert.match(stylesheet, /\.creator-publications-section\[hidden\]\s*\{[\s\S]*?display:\s*none/);
  assert.match(stylesheet, /@media \(max-width: 900px\)[\s\S]*?\.creator-directory-grid[\s\S]*?repeat\(2,/);
  assert.match(stylesheet, /@media \(max-width: 900px\)[\s\S]*?\.creator-summary-band\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(stylesheet, /@media \(max-width: 680px\)[\s\S]*?\.creator-directory-grid,[\s\S]*?grid-template-columns:\s*1fr/);
});

test('art archive assigns stable curated ids and separates profile links from open buttons', () => {
  const html = fs.readFileSync(path.join(root, 'guild-art.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'art.js'), 'utf8');
  const ids = [...html.matchAll(/\bid="(art-[a-z0-9-]+)"\s+data-art-id="\1"/g)].map((match) => match[1]);

  assert.equal(ids.length, 32);
  assert.equal(new Set(ids).size, 32);
  assert.match(script, /document\.createElement\('article'\)/);
  assert.match(script, /open\.className = 'art-card-open'/);
  assert.match(script, /card\.append\(window\.LuminaContentCredit\.create/);
  assert.doesNotMatch(script, /copy\.append\(window\.LuminaContentCredit\.create/);
});
