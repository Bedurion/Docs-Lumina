import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class TestElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.textContent = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  hasClass(className) {
    return this.className.split(/\s+/).includes(className);
  }
}

function loadCreditApi() {
  const context = {
    document: {
      createElement: (tagName) => new TestElement(tagName)
    },
    window: {}
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'content-credit.js'), 'utf8'),
    context,
    { filename: 'content-credit.js' }
  );
  return context.window.LuminaContentCredit;
}

test('content credits use Lumina as the exact guild fallback, including legacy placeholders', () => {
  const api = loadCreditApi();

  for (const value of [
    undefined,
    '',
    '  ',
    'Lumina community',
    'Lumina Guild',
    'Lumina member',
    'Lumina roleplay team',
    'Lumina staff'
  ]) {
    const credit = api.normalize(value);
    assert.equal(credit.name, 'Lumina');
    assert.equal(credit.isGuild, true);
  }
});

test('content credits render a compact linked signature without an avatar or monogram', () => {
  const api = loadCreditApi();
  const credit = api.create('  Sacrel   Knight  ', {
    creatorId: 'creator-sacrel',
    label: 'Artwork by',
    tone: 'art',
    compact: true
  });

  assert.equal(credit.tagName, 'A');
  assert.equal(credit.dataset.contentCredit, 'Sacrel Knight');
  assert.equal(credit.dataset.contentCreatorId, 'creator-sacrel');
  assert.equal(credit.href, 'guild-creator.html?profile=creator-sacrel');
  assert.equal(credit.attributes.get('aria-label'), 'View all content credited to Sacrel Knight');
  assert.equal(credit.hasClass('content-credit--art'), true);
  assert.equal(credit.hasClass('content-credit--compact'), true);
  assert.equal(credit.hasClass('is-guild'), false);
  assert.equal(credit.children.length, 2);
  assert.equal(credit.children[0].textContent, 'Artwork by');
  assert.equal(credit.children[1].textContent, 'Sacrel Knight');
  assert.equal(credit.children.some((child) => child.hasClass('content-credit__seal')), false);
});

test('guild fallback links to the Lumina archive and ignores unsupported presentation values', () => {
  const api = loadCreditApi();
  const credit = api.create(null, {
    label: '',
    tone: 'unknown',
    tagName: 'article'
  });

  assert.equal(credit.tagName, 'A');
  assert.equal(credit.hasClass('is-guild'), true);
  assert.equal(credit.hasClass('content-credit--unknown'), false);
  assert.equal(credit.dataset.contentCreatorId, 'lumina');
  assert.equal(credit.href, 'guild-creator.html?profile=lumina');
  assert.equal(credit.attributes.get('aria-label'), 'View the Lumina guild archive');
  assert.equal(credit.children[0].textContent, 'Created by');
  assert.equal(credit.children[1].textContent, 'Lumina');
});

test('legacy personal credits receive an opaque deterministic profile id', () => {
  const api = loadCreditApi();
  const first = api.create('Legacy Character');
  const second = api.create('Legacy Character');

  assert.equal(first.dataset.contentCreatorId, 'legacy-6b34410d622dfa8f');
  assert.equal(first.dataset.contentCreatorId, second.dataset.contentCreatorId);
  assert.doesNotMatch(first.href, /legacy-character/);
});

test('every community archive loads and uses the shared credit component', () => {
  const targets = [
    ['gallery.html', 'gallery.js'],
    ['blog.html', 'blog.js'],
    ['guild-art.html', 'art.js'],
    ['guild-roleplay.html', 'roleplay.js']
  ];

  for (const [htmlFile, pageScript] of targets) {
    const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
    const helperIndex = html.indexOf('content-credit.js');
    const pageIndex = html.indexOf(pageScript);
    assert.ok(helperIndex >= 0, `${htmlFile} must load the credit component`);
    assert.ok(helperIndex < pageIndex, `${htmlFile} must load the credit component before ${pageScript}`);

    const script = fs.readFileSync(path.join(root, pageScript), 'utf8');
    assert.match(script, /LuminaContentCredit\.create/);
  }

  const artwork = fs.readFileSync(path.join(root, 'art.js'), 'utf8');
  const artworkHtml = fs.readFileSync(path.join(root, 'guild-art.html'), 'utf8');
  const stylesheet = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

  assert.doesNotMatch(artwork, /tags\.push\(\s*`By /);
  assert.match(artworkHtml, /class="art-dialog-tags" data-art-dialog-tags/);
  assert.match(artworkHtml, /data-art-featured-credit/);
  assert.match(artworkHtml, /data-art-dialog-credit/);
  assert.doesNotMatch(stylesheet, /\.art-dialog-copy\s*>\s*div\s+span/);
  assert.match(stylesheet, /\.content-credit__name\s*\{[\s\S]*?color:\s*#82b7ff/i);
  assert.match(stylesheet, /\.content-credit:hover\s+\.content-credit__name,[\s\S]*?color:\s*#b9d5ff/i);
});
