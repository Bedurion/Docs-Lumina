import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('404 uses a bespoke, accessible lost-route composition', () => {
  const html = read('404.html');

  assert.match(html, /class="[^"]*\bpage-layout-404\b/);
  assert.match(html, /data-page-source="404\.html"/);
  assert.match(html, /data-root-absolute-links/);
  assert.match(html, /<section class="not-found-hero" aria-labelledby="not-found-title">/);
  assert.match(html, /<h1 id="not-found-title">You've wandered beyond the guild map\.<\/h1>/);
  assert.match(html, /<figure class="not-found-scene">/);
  assert.match(html, /alt="A lone hooded traveler[^"]+luminous fantasy city\."/);
  assert.match(html, />Return to the city</);
  assert.match(html, /<nav class="not-found-shortcuts" aria-label="Popular destinations">/);
  assert.doesNotMatch(html, /class="page-hero"/);
  assert.doesNotMatch(html, /trust-vault\.svg/);
});

test('404 remains fully rooted when GitHub Pages serves it for a nested missing URL', () => {
  const html = read('404.html');
  const localReferences = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:https?:|mailto:|tel:|data:|#)/i.test(value));

  assert.ok(localReferences.length >= 12);
  localReferences.forEach((reference) => {
    assert.match(reference, /^\//, `${reference} must resolve from the site root`);
  });

  const srcset = /<source\s+srcset="([^"]+)"/.exec(html)?.[1] || '';
  const srcsetPaths = srcset.split(',').map((entry) => entry.trim().split(/\s+/)[0]).filter(Boolean);
  assert.equal(srcsetPaths.length, 2);
  srcsetPaths.forEach((reference) => assert.match(reference, /^\//));

  const script = read('script.js');
  assert.match(script, /const declaredPageSource = document\.body\?\.dataset\.pageSource/);
  assert.match(script, /const useRootAbsoluteLinks = document\.body\?\.hasAttribute\('data-root-absolute-links'\)/);
  assert.match(script, /const siteLocalUrl = \(value\) =>/);
  assert.match(script, /href="\$\{siteLocalUrl\(href\)\}"/);
});

test('404 illustration is responsive and web-optimized', () => {
  const full = fs.statSync(path.join(root, 'assets/illustrations/lumina-lost-route-404.webp'));
  const compact = fs.statSync(path.join(root, 'assets/illustrations/lumina-lost-route-404-960.webp'));
  const stylesheet = read('styles.css');

  assert.ok(full.size > 100_000 && full.size < 350_000);
  assert.ok(compact.size > 40_000 && compact.size < full.size);
  assert.match(stylesheet, /\.not-found-hero\s*\{[\s\S]*?grid-template-areas:/);
  assert.match(stylesheet, /\.not-found-scene picture::after\s*\{[\s\S]*?linear-gradient/);
  assert.match(stylesheet, /@media \(max-width: 900px\)[\s\S]*?grid-template-areas:\s*"copy"\s*"scene"\s*"recovery"/);
  assert.match(stylesheet, /@media \(max-width: 650px\)[\s\S]*?\.not-found-recovery \.hero-actions[\s\S]*?grid-template-columns:\s*1fr/);
});

test('SEO tooling preserves root-absolute 404 references', () => {
  const buildSeo = read('tools/build-seo.mjs');
  const validator = read('tools/validate-site.js');

  assert.match(buildSeo, /function makeRootAbsoluteLocalReferences\(source\)/);
  assert.match(buildSeo, /output = makeRootAbsoluteLocalReferences\(output\);/);
  assert.match(buildSeo, /const rootAbsolute = relativePath\.startsWith\('\/'\);/);
  assert.match(validator, /replace\(\/\^\\\/\+\/, ''\)/);
  assert.match(validator, /href="\\\/\?assets\\\/brand\\\/favicon-dark\\\.svg"/);
});
