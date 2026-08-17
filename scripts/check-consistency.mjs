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
  'stamp-duty-calculator/index.html',
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

// og:image hotlinked from a third party is a silent single point of failure: if the
// host blocks hotlinking, deletes the file, or reorganises its paths, the social
// preview breaks with nothing in our own CI to catch it. Found live 2026-08-17: 6
// new-launch pages hotlink their og:image straight from img.singmap.com (a broker
// CDN, not ours). Self-hosting all 6 needs network access to img.singmap.com, which
// this guard's own CI environment doesn't have reason to require — so instead of
// silently passing, the current 6 are a named, shrinking exception. Delete a file's
// entry here in the same commit its og:image moves to /new-launches/img/ (JOE-289).
const KNOWN_HOTLINKED_OG_IMAGES = new Set([
  'new-launches/river-modern.html',
  'new-launches/narra-residences.html',
  'new-launches/vela-bay.html',
  'new-launches/newport-residences.html',
  'new-launches/dunearn-house.html',
  'new-launches/former-thomson-view.html',
]);

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

  // aria-labelledby/describedby/controls/owns must resolve to an id that actually
  // exists on the page — an unresolved reference gives assistive tech nothing
  // (no accessible name, no described-by text, no controls relationship), which
  // fails silently in a browser with no visual sign anything is wrong. Found live
  // on former-thomson-view.html: a <section aria-labelledby="sect-…-9807"> whose
  // <h2> was missing the matching id — every sibling section had it, this one didn't.
  {
    const ids = new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns']) {
      for (const m of s.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))) {
        const missing = m[1]
          .split(/\s+/)
          .filter(Boolean)
          .filter((id) => !ids.has(id));
        if (missing.length) fail(file, `${attr} references missing id(s): ${missing.join(', ')}`);
      }
    }
  }

  // <main> carries the skip-link target and the a11y landmark; a second id/tabindex
  // on the same tag is invalid HTML and the browser silently drops it, so a copy-paste
  // duplicate (e.g. id="main" ... id="main-content") passes an id="main" substring
  // check yet is one edit away from breaking the skip link for real.
  const mainTag = s.match(/<main\b[^>]*>/);
  if (mainTag) {
    for (const attr of ['id', 'tabindex']) {
      const count = (mainTag[0].match(new RegExp(`\\s${attr}=`, 'g')) || []).length;
      if (count > 1) fail(file, `<main> has ${count} "${attr}" attributes — duplicate, invalid HTML`);
    }
  }

  // Nested <a> is invalid HTML — the browser implicitly closes the outer anchor at
  // the inner tag, so any onclick/tracking handler on the outer anchor stops covering
  // whatever content sits inside the (now-orphaned) inner one. Found live on the
  // sell/rent-out phone CTA: the Google Ads conversion handler sat on the outer <a>,
  // the visible phone-number text sat in a silently-detached inner <a> with no tracking.
  {
    let depth = 0;
    for (const m of s.matchAll(/<a\b[^>]*>|<\/a\s*>/g)) {
      if (m[0][1] === '/') { if (depth > 0) depth--; }
      else { if (depth > 0) { fail(file, 'nested <a> tag — browser will implicitly close the outer anchor, silently detaching any handler on it from the inner anchor\'s content'); } depth++; }
    }
  }

  // A gtag conversion send_to with a literal PLACEHOLDER label is a TODO that shipped to
  // production. The label doesn't exist as a Google Ads conversion action, so the call is
  // a guaranteed no-op — every click on that CTA is invisible to Ads reporting and bidding,
  // and the try/catch already on these handlers swallows the failure with nothing surfaced
  // to a human. Found live on 10 pages / 21 CTAs: every WhatsApp float and book-modal button
  // site-wide was firing AW-18046717591/PLACEHOLDER_LABEL_FOR_WHATSAPP or .../PLACEHOLDER_CALENDLY.
  if (/'send_to':\s*'AW-[^']*PLACEHOLDER[^']*'/.test(s)) {
    fail(file, 'gtag conversion send_to still has a literal PLACEHOLDER label — this conversion is a silent no-op');
  }

  // A stray </main> with no matching <main> is invalid HTML, silently dropped by the
  // browser — a copy/paste or hand-edit can leave one behind after id="main" moves onto
  // some other element (found live on 4 pages: rent-out/index.html and three hand-built
  // new-launch pages, each with id="main" migrated onto the hero <section> but the old
  // </main> left in place lower down the file).
  {
    const opens = (s.match(/<main\b/g) || []).length;
    const closes = (s.match(/<\/main>/g) || []).length;
    if (opens !== closes) fail(file, `<main> open/close mismatch: ${opens} open tag(s), ${closes} close tag(s)`);
  }

  // ── Tracking invariants: if a tracker is present, it must be the canonical one, gated ──
  if (s.includes('googletagmanager.com/gtag')) {
    if (!s.includes(`gtag/js?id=${GA_ID}`)) fail(file, `gtag present but not the canonical ID ${GA_ID}`);
    if (!s.includes(`ga-disable-${GA_ID}`)) fail(file, 'gtag present without the PDPA consent gate');
    // ga-disable-<ID> only silences hits after gtag.js has already loaded — it does
    // nothing about the download itself. A static <script src> fetches gtag.js on every
    // page load even for a visitor who already declined, so the fetch must be gated too.
    if (/<script[^>]*\ssrc="https:\/\/www\.googletagmanager\.com\/gtag\/js/.test(s))
      fail(file, 'gtag.js is a static <script src> — it downloads even when consent was declined');
    if (
      !/if\(!window\._pdpaDeclined\)\{\s*var gaS=document\.createElement\('script'\);gaS\.async=true;gaS\.src='https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=GT-KVFDZD5V';document\.head\.appendChild\(gaS\);\s*\}/.test(
        s,
      )
    )
      fail(file, 'gtag.js loader is not gated behind the consent flag');
  }
  if (s.includes('fbevents.js')) {
    if (!s.includes(`fbq('init','${PIXEL_ID}')`)) fail(file, `pixel present but not the canonical ID ${PIXEL_ID}`);
    if (!s.includes('requestIdleCallback')) fail(file, 'pixel present without the idle-defer loader');
    // Wrapping only the later fbq('init'...) call in the consent gate still lets a
    // declined visitor download fbevents.js — the loader IIFE that fetches it must sit
    // inside the same gate as the calls that fire after it loads, not just those calls.
    if (!/if\(!window\._pdpaDeclined\)\{\s*!function\(f,b,e,v,n,t,s\)\{if\(f\.fbq\)return;/.test(s))
      fail(file, 'pixel loader (the fbevents.js fetch) is not wrapped in the consent gate');
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
    if (!img.startsWith(apex) && !KNOWN_HOTLINKED_OG_IMAGES.has(file)) {
      fail(file, `og:image is hotlinked from a third party instead of self-hosted: ${img}`);
    } else if (img.startsWith(apex) && KNOWN_HOTLINKED_OG_IMAGES.has(file)) {
      fail(file, `${file} is listed in KNOWN_HOTLINKED_OG_IMAGES but its og:image is now apex-hosted — remove the stale exception`);
    }
  }
  if (!s.includes('name="twitter:card"')) fail(file, 'missing twitter:card');
  if (!s.includes('rel="manifest"')) fail(file, 'missing manifest link');
  if (!s.includes('class="skip-link"')) fail(file, 'missing skip link');
  else if (!s.includes('id="main"')) fail(file, 'skip link present but no id="main" target');
  if (!/<meta name="viewport"/.test(s)) fail(file, 'missing viewport meta');

  // ── Estate-page structured data: the on-page medians/psf/YoY are only useful to a
  // crawler if they're also marked up. Parse every ld+json block rather than string-
  // matching, so a syntax-broken or copy-pasted-but-wrong block still fails the guard.
  if (file.startsWith('hdb-prices/') && file.endsWith('index.html')) {
    const blocks = [...s.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)]
      .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } });
    const nodes = blocks.flatMap((b) => (b && Array.isArray(b['@graph']) ? b['@graph'] : b ? [b] : []));
    const dataset = nodes.find((n) => n && n['@type'] === 'Dataset');
    const faq = nodes.find((n) => n && n['@type'] === 'FAQPage');
    if (!dataset) fail(file, 'missing Dataset JSON-LD for the HDB price figures on this page');
    else if (!Array.isArray(dataset.variableMeasured) || dataset.variableMeasured.length < 1) {
      fail(file, 'Dataset JSON-LD present but variableMeasured is empty');
    }
    if (!faq) fail(file, 'missing FAQPage JSON-LD for the HDB price figures on this page');
    else if (!Array.isArray(faq.mainEntity) || faq.mainEntity.length < 2) {
      fail(file, 'FAQPage JSON-LD present but has fewer than 2 questions');
    }
  }

  // ── HDB estate-page internal linking (JOE-289 cycle 2) ──
  // Town pages used to carry exactly one inbound link (from the hub) and
  // zero outbound links to each other, to new-launch projects, or to any
  // other tool/content page — the site's highest-demand keyword cluster was
  // carrying almost no internal PageRank. generate-estate-pages.mjs now
  // emits a nearby-towns block + calculator/glossary links on every town
  // page; this guards against that regressing back to isolated pages.
  if (/^hdb-prices\/[^/]+\/index\.html$/.test(file) && file !== 'hdb-prices/index.html') {
    const nearbyLinks = s.match(/href="\/hdb-prices\/[a-z0-9-]+\/"/g) || [];
    if (nearbyLinks.length < 3) fail(file, `estate page links to only ${nearbyLinks.length} other town pages — needs a nearby-towns block`);
    if (!s.includes('href="/hdb-prices/"')) fail(file, 'estate page missing a link back to the /hdb-prices/ hub');
    if (!s.includes('href="/calculator/"')) fail(file, 'estate page missing a link to /calculator/');
    if (!s.includes('href="/glossary/"')) fail(file, 'estate page missing a link to /glossary/');

    // These pages rank for the site's highest-intent queries and used to offer no
    // way to reach Joe at all — only anchors to other pages. Lead capture here is
    // the point of the cluster, so assert it rather than trusting a regeneration.
    if (!s.includes('id="estateLeadForm"')) fail(file, 'estate page has no lead form');
    if (!s.includes('wa.me/')) fail(file, 'estate page has no WhatsApp fallback');
    if (!s.includes('/js/estate-lead.js')) fail(file, 'estate page has a lead form but does not load /js/estate-lead.js');

    // The lead form and WhatsApp link sit at the very bottom, after the medians,
    // the flat-type tables, the nearby-town links and the FAQ — a reader had to
    // scroll the whole page before anything asked for the lead. The header nav
    // carries the only above-the-fold conversion path, so assert it survives a
    // regeneration rather than trusting the generator.
    const headerBlock = s.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0] || '';
    if (!headerBlock.includes('data-jt-header-nav')) {
      fail(file, 'estate page header is missing the shared nav (no above-the-fold conversion path)');
    } else if (!headerBlock.includes('href="/valuation.html"')) {
      fail(file, 'estate page header nav has no /valuation.html CTA');
    }
  }
}

console.log(`Checked ${pages.length} pages — ${failures} failure(s)`);
if (failures) process.exit(1);
