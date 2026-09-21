#!/usr/bin/env node
// Ensures every page carrying a contact link also loads the shared conversion
// tracking asset.
//
//   node scripts/apply-conversion-tracking.mjs          # inject where missing
//   node scripts/apply-conversion-tracking.mjs --check  # fail if any page is missing it
//
// Why this exists: assets/conversion-tracking.js installs one delegated click
// listener that fires `contact_click` for every wa.me, tel:, mailto: and
// Calendly link on the page. Measured 2026-09-14: 57 pages carried a contact
// link but never loaded the asset — all 27 hdb-prices town pages, all 27
// condo-prices district pages, both About pages and 404.html. Those pages
// reported page views but not a single tap on the CTA the page exists to serve,
// so there was no way to tell which town or district actually produces
// enquiries. Per-page <a onclick> handlers were the alternative and were
// rejected: ~230 anchors to edit, and each generated page would need its
// generator changed to keep them.
//
// Scope note: the asset is added only to pages that already load gtag. A page
// with no analytics at all is left alone rather than silently given tracking.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

export const CONVERSION_TRACKING_SRC = '/assets/conversion-tracking.js';
// Pages on the deferred loader carry no vendor URL of their own; without this
// they drop out of scope and a missing tracking tag stops being an error.
const ANALYTICS_LOADER_SRC = '/assets/analytics-loader.js';
const TAG = `<script src="${CONVERSION_TRACKING_SRC}" defer></script>`;
const SKIP_DIRS = ['node_modules', '.git', '.github', '.claude', '.gstack', 'scripts', 'ops', 'tests', 'netlify'];

// tel: is matched on the full country code so a stray "tel:" in prose does not
// pull a page in.
const CONTACT_LINK_RE = /href="(?:https:\/\/wa\.me\/|tel:\+65|mailto:joe@joetay\.com|https:\/\/calendly\.com\/)/;

const pages = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      walk(abs);
    } else if (entry.name.endsWith('.html')) {
      pages.push(rel);
    }
  }
})(ROOT);

const missing = [];
let written = 0;

for (const rel of pages.sort()) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');

  if (!CONTACT_LINK_RE.test(html)) continue;
  if (!html.includes('gtag/js?id=') && !html.includes(ANALYTICS_LOADER_SRC)) continue;
  if (html.includes(CONVERSION_TRACKING_SRC)) continue;

  if (!html.includes('</body>')) {
    missing.push(`${rel} (no </body> to inject before)`);
    continue;
  }

  if (checkOnly) {
    missing.push(rel);
    continue;
  }

  // Last thing before </body>: the listener is delegated on document, so it
  // does not need to run before the markup it serves.
  fs.writeFileSync(file, html.replace(/(\n?)(<\/body>)/, `\n${TAG}\n$2`));
  written += 1;
}

if (checkOnly) {
  for (const rel of missing) {
    console.error(
      `::error file=${rel}::page has a contact link but does not load ${CONVERSION_TRACKING_SRC} — run: node scripts/apply-conversion-tracking.mjs`,
    );
  }
  if (missing.length) process.exit(1);
  console.log(`Conversion tracking: all ${pages.length} pages checked, none missing the asset`);
} else {
  console.log(`Conversion tracking: ${written} page(s) updated, ${pages.length} checked`);
}
