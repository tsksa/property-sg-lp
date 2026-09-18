import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { siteHeaderHtml, currentSection, HEADER_LINKS, HEADER_CTA, SITE_HEADER_MARKER, SITE_THEME_ASSETS_HTML } from '../scripts/lib/site-header.mjs';
import { applySiteHeader, EXCLUDED, pagePathFor } from '../scripts/apply-site-header.mjs';
import { MOBILE_HEADER_MARKER } from '../scripts/lib/mobile-header.mjs';

// Guards the one shared header against the drift it replaced: measured
// 2026-09-17 the site carried nine header variants (site-nav, topbar, jt-hn,
// nl-topbar, blog-topbar, calc-topbar, g-topbar, site-head, lp-topbar) with
// different links, CTA labels and heights, and the theme toggle and mobile menu
// only existed where a template had remembered to load the shared assets.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'scripts', 'ops', 'tests', '.claude', 'tools']);
const LEGACY_HEADER_RE = /<header class="(?:topbar|nl-topbar|blog-topbar|calc-topbar|g-topbar|site-head)">|<nav class="site-nav"|data-jt-header-nav/;

function* htmlFiles(dir = ROOT) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* htmlFiles(abs);
    } else if (entry.name.endsWith('.html')) {
      yield path.relative(ROOT, abs);
    }
  }
}

const pages = [...htmlFiles()].filter((rel) => !EXCLUDED.has(rel)).sort();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the header offers every core destination and a WhatsApp CTA', () => {
  const html = siteHeaderHtml();
  for (const [href, label] of HEADER_LINKS) assert.ok(html.includes(`<a href="${href}">${label}</a>`), `missing ${label}`);
  assert.ok(html.includes(`<a class="jt-sh-cta" href="${HEADER_CTA[0]}">${HEADER_CTA[1]}</a>`));
  assert.match(HEADER_CTA[0], /^https:\/\/wa\.me\/6581881488\?text=/);
  assert.equal(new Set(HEADER_LINKS.map(([href]) => href)).size, HEADER_LINKS.length, 'duplicate link');
  for (const [href] of HEADER_LINKS) {
    const rel = href.endsWith('/') ? `${href.slice(1)}index.html` : href.slice(1);
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${href} does not resolve to a page`);
  }
});

test('the header marks the section the page lives under', () => {
  assert.equal(currentSection('/'), null);
  assert.equal(currentSection('/insights/hdb-valuation-explained.html'), '/insights/');
  assert.equal(currentSection('/new-launches/'), '/new-launches/');
  assert.equal(currentSection('/valuation.html'), '/valuation.html');
  assert.equal(currentSection('/hdb-prices/tampines/'), null);
  assert.match(siteHeaderHtml({ pagePath: '/calculator/' }), /<a href="\/calculator\/" aria-current="page">Calculators<\/a>/);
  assert.equal(pagePathFor('index.html'), '/');
  assert.equal(pagePathFor(path.join('hdb-prices', 'bedok', 'index.html')), '/hdb-prices/bedok/');
  assert.equal(pagePathFor('valuation.html'), '/valuation.html');
});

test('the header styles both themes itself and keeps AA contrast literals', () => {
  const html = siteHeaderHtml();
  assert.match(html, /\.jt-sh\{position:sticky;top:0/);
  assert.match(html, /html\.jt-theme-dark \.jt-sh\{background:rgba\(6,20,48,\.96\)/);
  assert.match(html, /\.jt-sh-nav>a\{color:#243653/);
  assert.match(html, /html\.jt-theme-dark \.jt-sh-nav>a\{color:#d8e2f0\}/);
  assert.match(html, /\.jt-sh-nav>a\.jt-sh-cta\{background:#10b981;color:#04231a[^}]*min-height:44px/);
  assert.doesNotMatch(html, /var\(--/, 'header colours must be literals: host pages define different custom properties');
});

test('every indexable page carries exactly one shared header and no legacy variant', () => {
  assert.ok(pages.length > 100, `only ${pages.length} pages found`);
  for (const rel of pages) {
    const html = read(rel);
    if (!/<body[\s>]/.test(html)) continue;
    assert.equal((html.match(new RegExp(`<header class="jt-sh" ${SITE_HEADER_MARKER}>`, 'g')) || []).length, 1, `${rel}: shared header count`);
    assert.doesNotMatch(html, LEGACY_HEADER_RE, `${rel}: legacy header still present`);
    assert.ok(html.includes(SITE_THEME_ASSETS_HTML), `${rel}: theme assets missing`);
    assert.ok(html.includes(MOBILE_HEADER_MARKER), `${rel}: mobile-header assets missing`);
    assert.ok(html.indexOf(SITE_THEME_ASSETS_HTML) < html.indexOf(`<header class="jt-sh"`), `${rel}: theme assets must load in <head>`);
  }
});

test('ad landers keep their minimal header on purpose', () => {
  for (const rel of ['sell/index.html', 'sell-hdb/singapore/index.html', 'rent-out/index.html']) {
    const html = read(rel);
    assert.doesNotMatch(html, /data-jt-site-header/, `${rel} must not offer site-wide navigation to paid traffic`);
    assert.match(html, /<header class="lp-topbar">/);
  }
});

test('applying the header is idempotent and replaces every legacy variant', () => {
  const once = applySiteHeader(read('insights/index.html'), 'insights/index.html');
  assert.equal(applySiteHeader(once, 'insights/index.html'), once);
  const legacy = `<head><title>x</title></head><body><header class="blog-topbar"><div><a href="/">PropertySG</a><nav aria-label="Primary"><a href="/">Home</a></nav></div></header><main></main></body>`;
  const applied = applySiteHeader(legacy, 'insights/x.html');
  assert.match(applied, /<header class="jt-sh" data-jt-site-header>/);
  assert.doesNotMatch(applied, /blog-topbar/);
  assert.ok(applied.includes(`${SITE_THEME_ASSETS_HTML}\n</head>`));
  const home = `<head></head><body><nav class="site-nav" aria-label="Primary"><a class="logo" href="/">x</a></nav>\n</header><main></main></body>`;
  assert.doesNotMatch(applySiteHeader(home, 'index.html'), /<\/header>\s*<main>[\s\S]*<\/header>|site-nav/);
  assert.equal(applySiteHeader('<body><p>no header</p></body>', 'x.html'), null);
});

test('the shared assets enhance the shared header, not the retired variants', () => {
  const js = read('assets/mobile-header.js');
  assert.match(js, /const HEADER_SELECTOR = 'header\[data-jt-site-header\]';/);
  assert.match(js, /max-width: 1024px/);
  assert.match(read('assets/mobile-header.css'), /@media\(max-width:1024px\)/);
  const theme = read('assets/site-theme.css');
  assert.doesNotMatch(theme, /\.site-nav|\.calc-topbar|\.blog-topbar|\.nl-topbar|\.jt-hn/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'scripts/apply-header-nav.mjs')));
});
