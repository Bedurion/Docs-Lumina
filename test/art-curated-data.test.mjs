import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { extractCuratedArt } = require('../tools/art-curated-data.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the curated Art data remains an exact public index of all static archive cards', () => {
  const html = fs.readFileSync(path.join(root, 'guild-art.html'), 'utf8');
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'art-curated.json'), 'utf8'));
  const extracted = extractCuratedArt(html);

  assert.equal(data.version, 1);
  assert.equal(data.entries.length, 32);
  assert.deepEqual(data.entries, extracted);
  assert.equal(new Set(data.entries.map((entry) => entry.id)).size, 32);

  for (const entry of data.entries) {
    assert.equal(entry.id, `art-${path.basename(entry.media.src, '.webp')}`);
    assert.equal(entry.creatorId, 'lumina');
    assert.equal(entry.credit, 'Lumina');
    assert.match(html, new RegExp(`\\bid="${entry.id}"`));
    assert.match(html, new RegExp(`\\bdata-art-id="${entry.id}"`));
  }
});
