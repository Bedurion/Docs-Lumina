'use strict';

const path = require('node:path');

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function attribute(source, name) {
  const match = source.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decodeHtml(match[1]) : '';
}

function subcategoryKey(value) {
  const normalized = decodeHtml(value)
    .split('·')
    .at(-1)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const aliases = new Map([
    ['npc-and-ally', 'npc'],
    ['daily-life', 'daily-life']
  ]);
  return aliases.get(normalized) || normalized || 'other';
}

function categoryKey(value, fallback) {
  const label = decodeHtml(value).split('·')[0].trim().toLowerCase();
  const categories = new Map([
    ['places', 'places'],
    ['heroes & characters', 'heroes'],
    ['creatures', 'creatures'],
    ['adversaries', 'adversaries'],
    ['guild life', 'guild-life'],
    ['objects & designs', 'objects'],
    ['abstract & concepts', 'concepts']
  ]);
  return categories.get(label) || fallback || 'concepts';
}

function extractCuratedArt(html) {
  const entries = [];
  const cardPattern = /<(button|article)\b([^>]*\bdata-art-src="assets\/art\/[^"]+"[^>]*)>([\s\S]*?)<\/\1>/g;

  for (const match of html.matchAll(cardPattern)) {
    const opening = match[2];
    const body = match[3];
    const src = attribute(opening, 'data-art-src');
    const basename = path.posix.basename(src, path.posix.extname(src));
    const imageTag = body.match(/<img\b[^>]*>/)?.[0] || '';
    const small = body.match(/<small>([\s\S]*?)<\/small>/)?.[1] || '';
    const categories = attribute(opening, 'data-art-categories').split(/\s+/).filter(Boolean);

    entries.push({
      id: `art-${basename}`,
      title: attribute(opening, 'data-art-title'),
      description: attribute(opening, 'data-art-description'),
      category: categoryKey(small, categories[0]),
      subcategory: subcategoryKey(small),
      credit: 'Lumina',
      creatorId: 'lumina',
      tags: attribute(opening, 'data-art-tags').split(',').map((tag) => tag.trim()).filter(Boolean),
      media: {
        type: 'image',
        src,
        alt: attribute(imageTag, 'alt'),
        width: Number(attribute(imageTag, 'width')),
        height: Number(attribute(imageTag, 'height'))
      }
    });
  }

  return entries;
}

module.exports = {
  extractCuratedArt
};
