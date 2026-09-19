#!/usr/bin/env node
// Puts each insights article's cover (insights/article-covers.json, rendered by
// scripts/build-article-covers.mjs) on the site (JOE-398):
//   - as the opening image, between the article header and its body;
//   - as the share preview: og:image (+ width, height, alt), twitter:image and
//     the BlogPosting JSON-LD image;
//   - as the thumbnail on its card in /insights/.
// Idempotent, like the other apply-* scripts.
//
//   node scripts/apply-article-cover.mjs          # write
//   node scripts/apply-article-cover.mjs --check  # fail if any page is stale

import fs from 'node:fs';
import { injectCover, cardImageHtml, coverPaths, CARD_MARKER } from './lib/article-covers.mjs';

const check = process.argv.includes('--check');
const { covers } = JSON.parse(fs.readFileSync('insights/article-covers.json', 'utf8'));

let stale = 0;
let changed = 0;
const problems = [];

function write(file, before, after) {
  if (before === after) return;
  if (check) {
    console.log(`::error file=${file}::article cover is missing or out of date`);
    stale += 1;
  } else {
    fs.writeFileSync(file, after);
    changed += 1;
  }
}

function applyToArticle(cover) {
  const file = `insights/${cover.slug}.html`;
  const before = fs.readFileSync(file, 'utf8');
  for (const p of [coverPaths(cover.slug).jpg, coverPaths(cover.slug).webpSmall]) {
    if (!fs.existsSync(p.slice(1))) problems.push(`${file}: ${p} missing — run node scripts/build-article-covers.mjs ${cover.slug}`);
  }
  try {
    write(file, before, injectCover(before, cover));
  } catch (e) {
    problems.push(`${file}: ${e.message}`);
  }
}

function applyToIndex() {
  const file = 'insights/index.html';
  const before = fs.readFileSync(file, 'utf8');
  let s = before.replace(new RegExp(`\\n\\s*<picture class="blog-card-img" ${CARD_MARKER}>[\\s\\S]*?</picture>`, 'g'), '');
  for (const cover of covers) {
    const open = `<a href="${cover.slug}.html" class="blog-card">`;
    if (!s.includes(open)) { problems.push(`${file}: no card for ${cover.slug}`); continue; }
    s = s.replace(open, `${open}\n        ${cardImageHtml(cover)}`);
  }
  write(file, before, s);
}

for (const cover of covers) applyToArticle(cover);
applyToIndex();

if (problems.length) {
  for (const p of problems) console.log(`::error::${p}`);
  process.exit(1);
}
if (check && stale) {
  console.log('Run: node scripts/apply-article-cover.mjs');
  process.exit(1);
}
console.log(check ? `Article covers: ${covers.length} articles up to date` : `Article covers: ${changed} page(s) updated, ${covers.length} covers`);
