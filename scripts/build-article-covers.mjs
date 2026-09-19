#!/usr/bin/env node
// Renders the insights article covers in insights/article-covers.json to
// img/insights/<slug>.jpg|.webp (1200×630) and <slug>-640.jpg|.webp (JOE-398).
//
// A dev-time step: the images are committed, so CI and Netlify never need
// Chrome. Re-run it after changing a cover or the article figures it quotes,
// then run scripts/apply-article-cover.mjs.
//
//   node scripts/build-article-covers.mjs            # every cover
//   node scripts/build-article-covers.mjs <slug>...  # just these
//
// Needs Google Chrome (or CHROME=/path/to/chrome) and python3 with Pillow.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateCover, coverPageHtml, COVER_W, COVER_H, SMALL_W, COVER_DIR } from './lib/article-covers.mjs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { covers } = JSON.parse(fs.readFileSync('insights/article-covers.json', 'utf8'));
const only = process.argv.slice(2);
const todo = only.length ? covers.filter((c) => only.includes(c.slug)) : covers;
if (!todo.length) throw new Error(`no covers match ${only.join(', ')}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-covers-'));
const fontUrl = (name) => pathToFileURL(path.resolve('assets/fonts', name)).href;
fs.mkdirSync(COVER_DIR, { recursive: true });

const pngs = [];
for (const cover of todo) {
  const html = fs.readFileSync(`insights/${cover.slug}.html`, 'utf8');
  const problems = validateCover(cover, html);
  if (problems.length) throw new Error(`${cover.slug}: ${problems.join('; ')}`);
  const page = path.join(tmp, `${cover.slug}.html`);
  const png = path.join(tmp, `${cover.slug}.png`);
  fs.writeFileSync(page, coverPageHtml(cover, html, { fontUrl }));
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${COVER_W},${COVER_H}`, '--virtual-time-budget=3000', `--screenshot=${png}`, pathToFileURL(page).href,
  ], { stdio: 'ignore' });
  if (!fs.existsSync(png)) throw new Error(`${cover.slug}: Chrome produced no screenshot`);
  pngs.push([png, cover.slug]);
  console.log(`rendered ${cover.slug}`);
}

// Pillow writes the four files per cover: progressive JPG for share previews
// (the widest support) and WebP for the page, each at full and 640 wide.
execFileSync('python3', ['-c', `
import sys, json
from PIL import Image
for png, slug in json.loads(sys.argv[1]):
    im = Image.open(png).convert('RGB')
    assert im.size == (${COVER_W}, ${COVER_H}), (slug, im.size)
    small = im.resize((${SMALL_W}, round(${COVER_H} * ${SMALL_W} / ${COVER_W})), Image.LANCZOS)
    base = '${COVER_DIR}/' + slug
    im.save(base + '.jpg', quality=82, optimize=True, progressive=True)
    small.save(base + '-${SMALL_W}.jpg', quality=80, optimize=True, progressive=True)
    im.save(base + '.webp', quality=80, method=6)
    small.save(base + '-${SMALL_W}.webp', quality=78, method=6)
`, JSON.stringify(pngs)], { stdio: 'inherit' });

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${todo.length} cover(s) written to ${COVER_DIR}/`);
