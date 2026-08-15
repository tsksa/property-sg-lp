#!/usr/bin/env node
// One-time (but idempotent/re-runnable) patch: every page's footer gets a
// consistent nav to the site's main sections. Before this, 33 pages carried
// a bare `<footer>` with legal text and 0-3 links — a visitor (and a
// crawler) landing on an HDB town page or a new-launch project page had no
// path back to the other clusters. Search Console shows near-zero organic
// presence; internal link equity is one of the few levers under our
// control, so every indexable page should link to every other cluster.
//
// Idempotent: skips any file that already has the `site-footer-links` marker,
// so re-running after adding a new page is safe.
//
// Run: node scripts/add-footer-sitelinks.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// Kept out of scope: no <footer> element to anchor into, and it's a one-off
// downloadable asset page rather than a navigable section of the site.
const SKIP = new Set(['downloads/seller-checklist-2026.html']);

const LINKS = [
  ['/', 'Home'],
  ['/hdb-prices/', 'HDB Resale Prices'],
  ['/new-launches/', 'New Launches'],
  ['/calculator/', 'Calculators'],
  ['/insights/', 'Insights'],
  ['/glossary/', 'Glossary'],
  ['/sell/', 'Sell'],
  ['/rent-out/', 'Rent Out'],
];

const NAV_HTML = `<nav class="site-footer-links" aria-label="More on PropertySG">${LINKS.map(
  ([href, label]) => `<a href="${href}">${label}</a>`,
).join(' · ')}</nav>`;

const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(ROOT, p);
    if (e.isDirectory()) {
      if (['node_modules', '.git', '.github', '.gstack', 'scripts', 'ops'].includes(e.name)) continue;
      walk(p);
    } else if (e.name.endsWith('.html')) {
      pages.push(rel);
    }
  }
})(ROOT);

let patched = 0;
let skipped = 0;
for (const file of pages) {
  if (SKIP.has(file)) continue;
  const s = fs.readFileSync(file, 'utf8');
  if (s.includes('site-footer-links')) {
    skipped++;
    continue;
  }
  // Some pages (the insights articles) have a second, earlier <footer> used
  // as an in-article "Related reads" block — not the real site footer. The
  // real one is always the last <footer> tag on the page, so anchor there.
  const opens = [...s.matchAll(/<footer([^>]*)>/g)];
  if (!opens.length) {
    console.error(`no <footer> found in ${file} — skipping`);
    continue;
  }
  const m = opens[opens.length - 1];
  const insertAt = m.index + m[0].length;

  // Some footers wrap everything in a single "-inner" div. footer{} itself
  // sometimes sets display:flex on its direct children (e.g. the homepage,
  // for its copyright/links split) — adding a second direct child there
  // would become a stray flex item and break that layout. Insert inside
  // the wrapper instead when one immediately follows the opening tag.
  const after = s.slice(insertAt);
  const wrapper = after.match(/^\s*<div class="[\w-]+-inner"[^>]*>/);
  const spliceAt = wrapper ? insertAt + wrapper[0].length : insertAt;

  const patchedContent = s.slice(0, spliceAt) + '\n' + NAV_HTML + s.slice(spliceAt);
  fs.writeFileSync(file, patchedContent);
  patched++;
}

console.log(`Patched ${patched} page(s), ${skipped} already had the footer nav.`);
