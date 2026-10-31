import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The quarterly HDB resale guide gets a new page each quarter (JOE-473). The
// official figures are typed into scripts/market-articles/build_articles.py by
// hand from HDB's release, so pin them here, and keep the editions linked.
const read = (slug) => fs.readFileSync(new URL(`../insights/${slug}.html`, import.meta.url), 'utf8');
const Q3 = 'hdb-resale-prices-3q-2026-by-town';
const Q2 = 'hdb-resale-prices-2q-2026-by-town';

test('3Q 2026 resale guide quotes HDB’s final 3Q 2026 figures and release', () => {
  const html = read(Q3);
  // HDB, "3rd Quarter 2026 Public Housing Data and Upcoming Flat Supply", 23 October 2026, paras 1–2.
  assert.ok(html.includes('<tr><th scope="row">Resale Price Index</th><td>202.5</td><td>−0.1% on 2Q 2026 (202.8)</td></tr>'));
  assert.ok(html.includes('<tr><th scope="row">Resale transactions</th><td>7,645</td><td>+19.5% on 2Q (6,396); +5.9% on 3Q 2025 (7,221)</td></tr>'));
  assert.ok(html.includes('https://www.hdb.gov.sg/hdb-pulse/news/2026/3rd-quarter-2026-public-housing-data-and-upcoming-flat-supply'));
  assert.ok(html.includes('23 October 2026'));
  const article = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1])).find((s) => s['@type'] === 'Article');
  assert.equal(article.mainEntityOfPage, `https://joetay.com/insights/${Q3}.html`);
  assert.equal(article.datePublished, '2026-10-31');
});

test('the 2Q and 3Q 2026 editions link to each other', () => {
  assert.ok(read(Q3).includes(`href="${Q2}.html"`));
  assert.ok(read(Q2).includes(`<a href="${Q3}.html">The 3Q 2026 edition</a>`));
});
