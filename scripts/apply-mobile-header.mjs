#!/usr/bin/env node
// Adds the shared responsive header assets to the four core page families:
// new launches, insights, calculators, and the HDB/valuation topbar pages.
// The homepage keeps its hand-authored menu, which is the visual/interaction
// reference for this shared implementation.
//
//   node scripts/apply-mobile-header.mjs
//   node scripts/apply-mobile-header.mjs --check

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mobileHeaderAssetsHtml, MOBILE_HEADER_MARKER } from './lib/mobile-header.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const TARGET_HEADER_RE = /<header class="[^"]*(?:nl-topbar|blog-topbar|calc-topbar|\btopbar\b)[^"]*">/m;
const EXISTING_RE = new RegExp(`\\n?<link rel="stylesheet" href="/assets/mobile-header\\.css" ${MOBILE_HEADER_MARKER}>\\n<script src="/assets/mobile-header\\.js" defer ${MOBILE_HEADER_MARKER}></script>`, 'g');

const pages = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.github', 'scripts', 'ops', 'tests', '.claude'].includes(entry.name)) continue;
      walk(abs);
    } else if (entry.name.endsWith('.html')) {
      const html = fs.readFileSync(abs, 'utf8');
      if (TARGET_HEADER_RE.test(html)) pages.push(rel);
    }
  }
})(ROOT);

const block = mobileHeaderAssetsHtml();
const missing = [];
const stale = [];
let written = 0;

for (const rel of pages.sort()) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');
  if (!/<\/head>/.test(html)) {
    missing.push(`${rel} (no </head> to inject before)`);
    continue;
  }
  const stripped = html.replace(EXISTING_RE, '');
  const injected = stripped.replace(/(\s*)(<\/head>)/, `\n${block}\n$2`);
  if (injected === html) continue;
  if (checkOnly) {
    (html.includes(MOBILE_HEADER_MARKER) ? stale : missing).push(rel);
  } else {
    fs.writeFileSync(file, injected);
    written += 1;
  }
}

if (checkOnly) {
  for (const rel of missing) console.error(`::error file=${rel}::page is missing the shared mobile-header assets`);
  for (const rel of stale) console.error(`::error file=${rel}::shared mobile-header assets are out of date`);
  if (missing.length || stale.length) {
    console.error('Run: node scripts/apply-mobile-header.mjs');
    process.exit(1);
  }
  console.log(`Shared mobile header present and current on ${pages.length} pages`);
} else {
  console.log(`Shared mobile header: ${written} page(s) updated, ${pages.length} checked`);
}
