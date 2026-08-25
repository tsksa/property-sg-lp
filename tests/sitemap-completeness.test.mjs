import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { expectedSitemapPath, findMissingSitemapEntries } from '../scripts/lib/sitemap-completeness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('expectedSitemapPath maps file paths to their sitemap URL', () => {
  assert.equal(expectedSitemapPath('index.html'), '/');
  assert.equal(expectedSitemapPath('valuation.html'), '/valuation.html');
  assert.equal(expectedSitemapPath('hdb-prices/ang-mo-kio/index.html'), '/hdb-prices/ang-mo-kio/');
  assert.equal(expectedSitemapPath('new-launches/dunearn-house.html'), '/new-launches/dunearn-house.html');
});

// Reproduces the bug class this guard exists to catch: a page that was created
// (and passes every other check-consistency.mjs invariant) but never got added
// to sitemap.xml, so a crawler has no way to discover it.
test('a page missing from sitemap.xml is flagged', () => {
  const pages = ['index.html', 'valuation.html', 'new-launches/some-new-project.html'];
  const sitemapXml = `<urlset>
    <url><loc>https://joetay.com/</loc></url>
    <url><loc>https://joetay.com/valuation.html</loc></url>
  </urlset>`;

  const missing = findMissingSitemapEntries(pages, sitemapXml, () => true);
  assert.deepEqual(missing, ['new-launches/some-new-project.html']);
});

test('a fully-covered page set reports nothing missing', () => {
  const pages = ['index.html', 'valuation.html'];
  const sitemapXml = `<urlset>
    <url><loc>https://joetay.com/</loc></url>
    <url><loc>https://joetay.com/valuation.html</loc></url>
  </urlset>`;

  assert.deepEqual(findMissingSitemapEntries(pages, sitemapXml, () => true), []);
});

test('pages excluded by the isIndexable predicate are never flagged, even if absent from the sitemap', () => {
  const pages = ['404.html', 'autopilot/index.html'];
  const sitemapXml = '<urlset></urlset>';

  assert.deepEqual(
    findMissingSitemapEntries(pages, sitemapXml, () => false),
    [],
  );
});

// End-to-end: run the same predicate check-consistency.mjs uses (indexable,
// non-redirected, non-HomeLah) against the real sitemap.xml. This is what
// would have caught former-thomson-view.html-style cases if they'd been a
// live page rather than a 301-redirected one, and it's what running `npm
// run check` today asserts stays true.
test('every indexable page in the current repo has a sitemap.xml entry', () => {
  const sitemapXml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const redirected = new Set(
    fs
      .readFileSync(path.join(ROOT, '_redirects'), 'utf8')
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => line.trim().split(/\s+/))
      .filter(([, , code]) => code === '301!')
      .map(([from]) => from.replace(/^\//, '')),
  );
  const utility = new Set(['404.html', 'downloads/seller-checklist-2026.html', 'privacy-policy.html']);

  const pages = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', '.github', '.claude', '.gstack', 'scripts', 'ops'].includes(e.name)) continue;
        walk(rel);
      } else if (e.name.endsWith('.html')) {
        pages.push(rel);
      }
    }
  })('.');

  const isIndexable = (file) => !utility.has(file) && !redirected.has(file) && !file.startsWith('autopilot/');
  assert.deepEqual(findMissingSitemapEntries(pages, sitemapXml, isIndexable), []);
});

test('every sitemap changefreq uses a value accepted by the sitemap protocol', () => {
  const sitemapXml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const allowed = new Set(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']);
  const invalid = [];

  for (const block of sitemapXml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block[1].match(/<loc>([^<]+)<\/loc>/)?.[1];
    const changefreq = block[1].match(/<changefreq>([^<]+)<\/changefreq>/)?.[1];
    if (changefreq && !allowed.has(changefreq)) invalid.push(`${loc ?? 'unknown URL'} → ${changefreq}`);
  }

  assert.deepEqual(invalid, [], 'sitemap.xml contains invalid changefreq values');
});
