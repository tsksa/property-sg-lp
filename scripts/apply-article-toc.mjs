#!/usr/bin/env node
// Apply the "On this page" TOC to every insight article. Generated articles
// already carry it from their generator; this covers the hand-built ones and,
// with --check, proves none has drifted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectToc } from './lib/article-toc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'insights');
const CHECK = process.argv.includes('--check');

let changed = 0;
let checked = 0;
const stale = [];
for (const file of fs.readdirSync(DIR)) {
  if (!file.endsWith('.html') || file === 'index.html') continue;
  const abs = path.join(DIR, file);
  const before = fs.readFileSync(abs, 'utf8');
  const after = injectToc(before);
  checked += 1;
  if (after === before) continue;
  if (CHECK) stale.push(`insights/${file}`);
  else {
    fs.writeFileSync(abs, after);
    changed += 1;
  }
}
if (CHECK) {
  if (stale.length) {
    for (const rel of stale) console.error(`::error::${rel} is missing or has a stale article TOC — run npm run apply:article-toc`);
    process.exit(1);
  }
  console.log(`Article TOC: ${checked} article(s) current`);
} else {
  console.log(`Article TOC: ${changed} article(s) updated, ${checked} checked`);
}
