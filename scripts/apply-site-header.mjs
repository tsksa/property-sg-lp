#!/usr/bin/env node
// Puts the one shared header (scripts/lib/site-header.mjs) on every indexable
// page and makes sure the page loads the theme and mobile-header assets it needs.
//
//   node scripts/apply-site-header.mjs          # inject / refresh
//   node scripts/apply-site-header.mjs --check  # fail if any page is missing or stale
//
// Idempotent: an existing shared header is replaced in place, and any of the
// legacy header variants (topbar, nl-topbar, blog-topbar, calc-topbar,
// g-topbar, site-head, the homepage's site-nav) is replaced on first run. Run it
// AFTER the page generators and BEFORE apply-mobile-header.mjs, which injects
// its assets ahead of </head> and expects nothing to be added after them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { siteHeaderHtml, SITE_HEADER_MARKER, SITE_THEME_ASSETS_HTML } from './lib/site-header.mjs';
import { MOBILE_HEADER_MARKER } from './lib/mobile-header.mjs';
import { fontLinksHtml, FONT_BLOCK_MARKER } from './lib/self-hosted-fonts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

// Ads landers keep a deliberately minimal header so paid traffic is not offered
// site-wide navigation; the download is a print-oriented utility page.
export const EXCLUDED = new Set([
  'sell/index.html',
  'sell-hdb/singapore/index.html',
  'rent-out/index.html',
  'zh/sell-hdb/index.html',
  'downloads/seller-checklist-2026.html',
]);

const SHARED_RE = new RegExp(`<header class="jt-sh" ${SITE_HEADER_MARKER}>[\\s\\S]*?</style>\\s*</header>`);
const LEGACY_HEADER_RE = /<header class="(?:topbar|nl-topbar|blog-topbar|calc-topbar|g-topbar|site-head)">[\s\S]*?<\/header>/;
// The homepage's hand-authored nav, plus the stray </header> that followed it.
const LEGACY_HOME_NAV_RE = /<nav class="site-nav" aria-label="Primary">[\s\S]*?<\/nav>(?:\s*<\/header>)?/;

export function pagePathFor(rel) {
  const posix = rel.split(path.sep).join('/');
  if (posix === 'index.html') return '/';
  return posix.endsWith('/index.html') ? `/${posix.slice(0, -'index.html'.length)}` : `/${posix}`;
}

export function applySiteHeader(html, rel) {
  const block = siteHeaderHtml({ pagePath: pagePathFor(rel) });
  let out = html;
  if (SHARED_RE.test(out)) out = out.replace(SHARED_RE, () => block);
  else if (LEGACY_HEADER_RE.test(out)) out = out.replace(LEGACY_HEADER_RE, () => block);
  else if (LEGACY_HOME_NAV_RE.test(out)) out = out.replace(LEGACY_HOME_NAV_RE, () => block);
  else return null;

  // Theme assets go before the mobile-header assets (or </head>), so that
  // apply-mobile-header.mjs, which re-injects its block ahead of </head>, still
  // finds its block last.
  // The header is set in Fraunces and DM Sans; a page that never loaded webfonts
  // (about-joe used system fonts) needs the self-hosted block, or the header
  // falls back to Georgia and Arial there alone.
  const fontBlock = out.includes(`${FONT_BLOCK_MARKER}=`) ? '' : `${fontLinksHtml({ display: 'swap' })}\n`;
  if (fontBlock || !out.includes(SITE_THEME_ASSETS_HTML)) {
    out = out
      .replace(/\n?<link rel="stylesheet" href="\/assets\/site-theme\.css">/g, '')
      .replace(/\n?<script src="\/assets\/site-theme\.js"><\/script>/g, '');
    const mobileAssets = out.match(new RegExp(`\\n?<link rel="stylesheet" href="/assets/mobile-header\\.css" ${MOBILE_HEADER_MARKER}>`));
    out = mobileAssets
      ? out.replace(mobileAssets[0], `\n${fontBlock}${SITE_THEME_ASSETS_HTML}${mobileAssets[0]}`)
      : out.replace(/(\s*)(<\/head>)/, `\n${fontBlock}${SITE_THEME_ASSETS_HTML}\n$2`);
  }
  return out;
}

function pages() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(ROOT, abs);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', '.github', 'scripts', 'ops', 'tests', '.claude', 'tools'].includes(entry.name)) continue;
        walk(abs);
      } else if (entry.name.endsWith('.html') && !EXCLUDED.has(rel)) {
        out.push(rel);
      }
    }
  })(ROOT);
  return out.sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missing = [];
  const stale = [];
  let written = 0;
  let checked = 0;

  for (const rel of pages()) {
    const file = path.join(ROOT, rel);
    const html = fs.readFileSync(file, 'utf8');
    if (!/<body[\s>]/.test(html)) continue;
    checked += 1;
    const next = applySiteHeader(html, rel);
    if (next === null) {
      missing.push(`${rel} (no header to replace)`);
      continue;
    }
    if (next === html) continue;
    if (checkOnly) (html.includes(SITE_HEADER_MARKER) ? stale : missing).push(rel);
    else {
      fs.writeFileSync(file, next);
      written += 1;
    }
  }

  if (checkOnly) {
    for (const rel of missing) console.error(`::error file=${rel}::page is missing the shared site header`);
    for (const rel of stale) console.error(`::error file=${rel}::shared site header is out of date`);
    if (missing.length || stale.length) {
      console.error('Run: node scripts/apply-site-header.mjs');
      process.exit(1);
    }
    console.log(`Shared site header present and current on ${checked} pages`);
  } else {
    for (const m of missing) console.error(`::warning::${m}`);
    console.log(`Shared site header: ${written} page(s) updated, ${checked} checked`);
  }
}
