#!/usr/bin/env node
// Injects the shared footer navigation into every indexable page.
//
//   node scripts/apply-site-footer.mjs          # inject / refresh
//   node scripts/apply-site-footer.mjs --check  # fail if any page is missing or stale
//
// Idempotent: an existing block is replaced rather than duplicated, so this can
// run after the page generators on every build. Run it AFTER them and BEFORE
// refresh-sitemap-lastmod.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { siteFooterHtml, FOOTER_MARKER } from './lib/site-footer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

// Ads landers leak paid traffic if given site-wide outbound links; the rest are
// noindex utility pages with nothing to gain.
const EXCLUDED = new Set([
  'sell/index.html',
  'rent-out/index.html',
  '404.html',
  'privacy-policy.html',
  'downloads/seller-checklist-2026.html',
]);

const pages = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.github', 'scripts', 'ops', 'tests', '.claude'].includes(entry.name)) continue;
      walk(abs);
    } else if (entry.name.endsWith('.html') && !EXCLUDED.has(rel)) {
      pages.push(rel);
    }
  }
})(ROOT);

const block = siteFooterHtml();
const existingRe = new RegExp(`\\n?<nav class="jt-sf" ${FOOTER_MARKER}[\\s\\S]*?</style>`, 'g');

const missing = [];
const stale = [];
let written = 0;

for (const rel of pages) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');

  if (!/<footer[\s>]/.test(html)) {
    missing.push(`${rel} (no <footer> to inject into)`);
    continue;
  }

  const stripped = html.replace(existingRe, '');
  // Insert immediately after the opening <footer …> tag so the block leads the
  // footer, ahead of each page's own copyright and licence lines.
  const injected = stripped.replace(/(<footer[^>]*>)/, `$1\n${block}`);

  if (injected === html) continue;

  if (checkOnly) {
    (html.includes(FOOTER_MARKER) ? stale : missing).push(rel);
  } else {
    fs.writeFileSync(file, injected);
    written += 1;
  }
}

if (checkOnly) {
  for (const rel of missing) console.error(`::error file=${rel}::page is missing the shared site footer`);
  for (const rel of stale) console.error(`::error file=${rel}::shared site footer is out of date`);
  if (missing.length || stale.length) {
    console.error('Run: node scripts/apply-site-footer.mjs');
    process.exit(1);
  }
  console.log(`Shared site footer present and current on ${pages.length} pages`);
} else {
  if (missing.length) for (const m of missing) console.error(`::warning::${m}`);
  console.log(`Shared site footer: ${written} page(s) updated, ${pages.length} checked`);
}
