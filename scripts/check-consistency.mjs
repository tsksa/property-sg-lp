#!/usr/bin/env node
// Consistency guard for a build-less multi-page site.
//
// joetay.com is 26 hand-maintained HTML files with no shared templating, so
// every cross-page concern (tracking, consent, meta, a11y chrome) exists as
// N copies that drift. This script pins those invariants: it fails CI when a
// page is missing a required block or carries a variant of one.
//
// Run: node scripts/check-consistency.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GA_ID = 'GT-KVFDZD5V';
const PIXEL_ID = '3279494272146114';

// Pages excluded from indexable-page invariants (noindex utility pages).
const UTILITY = new Set(['404.html', 'downloads/seller-checklist-2026.html', 'privacy-policy.html']);

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

let failures = 0;
const fail = (file, msg) => {
  failures++;
  console.error(`::error file=${file}::${msg}`);
};

for (const file of pages) {
  const s = fs.readFileSync(file, 'utf8');
  const indexable = !UTILITY.has(file);

  // ── Universal invariants (every HTML file) ──
  if (!/<html[^>]*\slang=/.test(s)) fail(file, 'missing lang attribute on <html>');
  if ((s.match(/<title>/g) || []).length !== 1) fail(file, 'must have exactly one <title>');
  if (s.includes('<<<<<<<') || s.includes('>>>>>>>')) fail(file, 'merge conflict markers present');
  if (/REMOVE BEFORE GOING LIVE|EDITORIAL NOTE/i.test(s)) fail(file, 'editorial/leak comment present');

  // ── Tracking invariants: if a tracker is present, it must be the canonical one, gated ──
  if (s.includes('googletagmanager.com/gtag')) {
    if (!s.includes(`gtag/js?id=${GA_ID}`)) fail(file, `gtag present but not the canonical ID ${GA_ID}`);
    if (!s.includes(`ga-disable-${GA_ID}`)) fail(file, 'gtag present without the PDPA consent gate');
  }
  if (s.includes('fbevents.js')) {
    if (!s.includes(`fbq('init','${PIXEL_ID}')`)) fail(file, `pixel present but not the canonical ID ${PIXEL_ID}`);
    if (!s.includes('_pdpaDeclined')) fail(file, 'pixel present without the consent gate');
    if (!s.includes('requestIdleCallback')) fail(file, 'pixel present without the idle-defer loader');
  }

  // ── Lead-form invariants: any page that posts to submit-lead needs the helper ──
  if (s.includes('submit-lead') && !s.includes('recaptcha-helper.js')) {
    fail(file, 'posts to submit-lead but does not load recaptcha-helper.js (honeypot + token)');
  }

  if (!indexable) continue;

  // ── Indexable-page invariants ──
  if ((s.match(/rel="canonical"/g) || []).length !== 1) fail(file, 'must have exactly one canonical');
  else {
    const href = s.match(/rel="canonical" href="([^"]+)"/)?.[1] || '';
    if (!href.startsWith('https://joetay.com/')) fail(file, `canonical not on apex domain: ${href}`);
  }
  if ((s.match(/<meta name="description"/g) || []).length !== 1) fail(file, 'must have exactly one meta description');
  if (!s.includes('property="og:image"')) fail(file, 'missing og:image');
  if (!s.includes('name="twitter:card"')) fail(file, 'missing twitter:card');
  if (!s.includes('rel="manifest"')) fail(file, 'missing manifest link');
  if (!s.includes('class="skip-link"')) fail(file, 'missing skip link');
  else if (!s.includes('id="main"')) fail(file, 'skip link present but no id="main" target');
  if (!/<meta name="viewport"/.test(s)) fail(file, 'missing viewport meta');
}

console.log(`Checked ${pages.length} pages — ${failures} failure(s)`);
if (failures) process.exit(1);
