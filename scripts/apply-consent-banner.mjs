#!/usr/bin/env node
// Injects the shared PDPA consent banner into every page that loads GA4/Meta
// Pixel, so a visitor who lands directly on that page (organic or paid —
// almost every visitor, since the homepage isn't the primary entry point)
// is actually offered a consent choice instead of being tracked silently.
//
//   node scripts/apply-consent-banner.mjs          # inject / refresh
//   node scripts/apply-consent-banner.mjs --check  # fail if any page is missing or stale
//
// Idempotent: an existing block is replaced rather than duplicated. Run
// AFTER the page generators and BEFORE refresh-sitemap-lastmod.mjs — same
// slot as apply-site-footer.mjs / apply-header-nav.mjs.
//
// Scope is "loads the GA4/Pixel opt-out gate" (`ga-disable-GT-KVFDZD5V`),
// not "indexable page" — this deliberately includes the noindex/ads-lander
// pages apply-site-footer.mjs excludes (404.html, privacy-policy.html,
// downloads/seller-checklist-2026.html, sell/, rent-out/), because all of
// them load trackers too. index.html is excluded: it already carries a
// hand-authored equivalent embedded in its own combined stylesheet.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { consentBannerHtml, CONSENT_BANNER_MARKER } from './lib/consent-banner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const EXCLUDED = new Set(['index.html']);

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

const block = consentBannerHtml();
const existingRe = new RegExp(`\\n?<div class="jt-cb" ${CONSENT_BANNER_MARKER}[\\s\\S]*?</script>`, 'g');

const missing = [];
const stale = [];
const notApplicable = [];
let written = 0;

for (const rel of pages) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');

  // Only pages that actually load the trackers need the consent prompt.
  if (!html.includes('ga-disable-GT-KVFDZD5V')) {
    notApplicable.push(rel);
    continue;
  }

  if (!/<\/body>/.test(html)) {
    missing.push(`${rel} (no </body> to inject before)`);
    continue;
  }

  const stripped = html.replace(existingRe, '');
  const injected = stripped.replace(/(\s*)(<\/body>)/, `\n${block}\n$2`);

  if (injected === html) continue;

  if (checkOnly) {
    (html.includes(CONSENT_BANNER_MARKER) ? stale : missing).push(rel);
  } else {
    fs.writeFileSync(file, injected);
    written += 1;
  }
}

const applicable = pages.length - notApplicable.length;

if (checkOnly) {
  for (const rel of missing) console.error(`::error file=${rel}::page loads trackers but is missing the PDPA consent banner`);
  for (const rel of stale) console.error(`::error file=${rel}::PDPA consent banner is out of date`);
  if (missing.length || stale.length) {
    console.error('Run: node scripts/apply-consent-banner.mjs');
    process.exit(1);
  }
  console.log(`PDPA consent banner present and current on ${applicable} tracker-bearing pages`);
} else {
  console.log(`PDPA consent banner: ${written} page(s) updated, ${applicable} tracker-bearing pages checked`);
}
