#!/usr/bin/env node
// Consistency guard for a build-less multi-page site.
//
// joetay.com is 70+ HTML files with no shared templating, so every cross-page
// concern (tracking, consent, meta, a11y chrome) exists as N copies that drift.
// This script pins those invariants: it fails CI when a page is missing a
// required block or carries a variant of one.
//
// Run: node scripts/check-consistency.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GA_ID = 'GT-KVFDZD5V';
const PIXEL_ID = '3279494272146114';

// Pages excluded from indexable-page invariants (noindex utility pages).
const UTILITY = new Set(['404.html', 'downloads/seller-checklist-2026.html', 'privacy-policy.html']);

// High-intent organic entry points: someone reading an article on
// selling/valuation, or looking at their calculated affordability, is a
// lead with active intent. These pages must carry a WhatsApp CTA so that
// intent has somewhere to go instead of bouncing.
const REQUIRES_WHATSAPP_CTA = new Set([
  'calculator/index.html',
  'insights/index.html',
  'insights/hdb-valuation-explained.html',
  'insights/how-long-to-sell-hdb-singapore-2026.html',
  'insights/selling-hdb-after-mop-singapore.html',
  'insights/property-agent-commission-singapore.html',
  'glossary/index.html',
]);

// Google truncates around 155-160 chars. ARCHITECTURE.md states this rule; without
// an assertion it drifted to 28 over-length pages before anyone noticed.
const DESCRIPTION_MAX = 160;

// Pages behind a forced 301 in _redirects never reach a crawler — Netlify serves the
// redirect instead of the file. Reading the set from _redirects keeps this in step
// with the redirect table instead of hardcoding a list that goes stale.
const REDIRECTED = new Set(
  (fs.existsSync('_redirects') ? fs.readFileSync('_redirects', 'utf8') : '')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => line.trim().split(/\s+/))
    .filter(([, , code]) => code === '301!')
    .map(([from]) => from.replace(/^\//, '')),
);

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
  const indexable = !UTILITY.has(file) && !REDIRECTED.has(file);

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
    // Assert the guarded call form, not just the flag name. The old check tested for
    // "_pdpaDeclined" anywhere in the file, which the GA snippet above also sets — so
    // it passed on index.html while the pixel init sat outside any guard.
    if (!s.includes("_pdpaDeclined){fbq('init'")) fail(file, 'pixel init not wrapped in the consent gate');
    if (!s.includes('requestIdleCallback')) fail(file, 'pixel present without the idle-defer loader');
  }

  // ── Lead-form invariants: any page that posts to submit-lead needs the helper ──
  // Follow local <script src> too: new-launches/index.html POSTs from new-launches.js,
  // so an inline-only check saw nothing and every modal lead went out with no token.
  const postsToSubmitLead =
    s.includes('submit-lead') ||
    [...s.matchAll(/<script[^>]+src="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((src) => !/^https?:|^\/\//.test(src))
      .some((src) => {
        const resolved = src.startsWith('/')
          ? path.join(ROOT, src.slice(1))
          : path.join(path.dirname(file), src);
        return fs.existsSync(resolved) && fs.readFileSync(resolved, 'utf8').includes('submit-lead');
      });
  if (postsToSubmitLead && !s.includes('recaptcha-helper.js')) {
    fail(file, 'posts to submit-lead but does not load recaptcha-helper.js (honeypot + token)');
  }

  if (REQUIRES_WHATSAPP_CTA.has(file) && !s.includes('wa.me/')) {
    fail(file, 'high-intent page has no WhatsApp CTA (wa.me link) for lead capture');
  }

  if (!indexable) continue;

  // ── Indexable-page invariants ──
  if ((s.match(/rel="canonical"/g) || []).length !== 1) fail(file, 'must have exactly one canonical');
  else {
    const href = s.match(/rel="canonical" href="([^"]+)"/)?.[1] || '';
    if (!href.startsWith('https://joetay.com/')) fail(file, `canonical not on apex domain: ${href}`);
  }
  if ((s.match(/<meta name="description"/g) || []).length !== 1) fail(file, 'must have exactly one meta description');
  else {
    const desc = s.match(/<meta name="description" content="([^"]*)"/)?.[1] || '';
    if (desc.length > DESCRIPTION_MAX) {
      fail(file, `meta description is ${desc.length} chars; maximum is ${DESCRIPTION_MAX}`);
    }
  }
  if (!s.includes('property="og:image"')) fail(file, 'missing og:image');
  else {
    // An og:image that 301s is dropped by several social and AI crawlers, so assert
    // apex-hosted previews point at a file that actually exists at that exact path.
    const img = s.match(/property="og:image" content="([^"]*)"/)?.[1] || '';
    const apex = 'https://joetay.com/';
    if (img.startsWith(apex) && !fs.existsSync(img.slice(apex.length))) {
      fail(file, `og:image does not resolve to a file at that path: ${img}`);
    }
  }
  if (!s.includes('name="twitter:card"')) fail(file, 'missing twitter:card');
  if (!s.includes('rel="manifest"')) fail(file, 'missing manifest link');
  if (!s.includes('class="skip-link"')) fail(file, 'missing skip link');
  else if (!s.includes('id="main"')) fail(file, 'skip link present but no id="main" target');
  if (!/<meta name="viewport"/.test(s)) fail(file, 'missing viewport meta');
}

console.log(`Checked ${pages.length} pages — ${failures} failure(s)`);
if (failures) process.exit(1);
