import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import curatedArt from './art-curated-data.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await fs.readFile(path.join(root, 'guild-art.html'), 'utf8');
const entries = curatedArt.extractCuratedArt(html);

if (entries.length !== 32) {
  throw new Error(`Expected 32 curated artworks, found ${entries.length}.`);
}

await fs.writeFile(
  path.join(root, 'data', 'art-curated.json'),
  `${JSON.stringify({ version: 1, entries }, null, 2)}\n`,
  'utf8'
);
