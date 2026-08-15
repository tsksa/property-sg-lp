#!/usr/bin/env node
// Injects the shared header navigation into the bare `topbar` pages.
//
//   node scripts/apply-header-nav.mjs          # inject / refresh
//   node scripts/apply-header-nav.mjs --check  # fail if any page is missing or stale
//
// Idempotent: an existing block is replaced rather than duplicated, so this can
// run after the page generators on every build. Run it AFTER them and BEFORE
// refresh-sitemap-lastmod.mjs — same slot as apply-site-footer.mjs.
//
// Scope is the /hdb-prices/ cluster plus /neighbour-prices/ — the other bare-
// `topbar` page that shares the same high-intent-but-buried-CTA problem this
// block exists to fix. valuation.html also shares the `topbar` template but is
// itself the conversion target, so a "Free Valuation" CTA there would point at
// the page the reader is already on; unifying its header needs a different
// link set and is deliberately left out of this pass.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { headerNavHtml, HEADER_NAV_MARKER } from './lib/header-nav.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const pages = fs
  .readdirSync(path.join(ROOT, 'hdb-prices'), { withFileTypes: true })
  .flatMap((entry) =>
    entry.isDirectory()
      ? [path.join('hdb-prices', entry.name, 'index.html')]
      : entry.name === 'index.html'
        ? [path.join('hdb-prices', entry.name)]
        : [],
  )
  .concat(['neighbour-prices/index.html'])
  .filter((rel) => fs.existsSync(path.join(ROOT, rel)))
  .sort();

const block = headerNavHtml();
// Matches either the original "← Back to home" link or a previously injected
// block, so the first run replaces the old link and later runs refresh in place.
const backLinkRe = /\n?\s*<a href="\/" class="back">[^<]*<\/a>/;
const existingRe = new RegExp(`\\n?\\s*<nav class="jt-hn" ${HEADER_NAV_MARKER}[\\s\\S]*?</style>`);

const missing = [];
const stale = [];
let written = 0;

for (const rel of pages) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');

  if (!/<header class="topbar">/.test(html)) {
    missing.push(`${rel} (no topbar header to inject into)`);
    continue;
  }

  const had = html.includes(HEADER_NAV_MARKER);
  const stripped = html.replace(existingRe, '').replace(backLinkRe, '');
  // Insert as the last child of .topbar-inner, after the logo.
  const injected = stripped.replace(
    /(<a href="\/" class="logo">[^<]*<\/a>)/,
    `$1\n    ${block}`,
  );

  if (injected === html) continue;

  if (!/<nav class="jt-hn"/.test(injected)) {
    missing.push(`${rel} (no .logo anchor to anchor the nav to)`);
    continue;
  }

  if (checkOnly) {
    (had ? stale : missing).push(rel);
  } else {
    fs.writeFileSync(file, injected);
    written += 1;
  }
}

if (checkOnly) {
  for (const rel of missing) console.error(`::error file=${rel}::page is missing the shared header nav`);
  for (const rel of stale) console.error(`::error file=${rel}::shared header nav is out of date`);
  if (missing.length || stale.length) {
    console.error('Run: node scripts/apply-header-nav.mjs');
    process.exit(1);
  }
  console.log(`Shared header nav present and current on ${pages.length} pages`);
} else {
  if (missing.length) for (const m of missing) console.error(`::warning::${m}`);
  console.log(`Shared header nav: ${written} page(s) updated, ${pages.length} checked`);
}
