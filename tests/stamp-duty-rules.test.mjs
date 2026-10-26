import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Guards the stamp-duty calculator's BSD tier table and ABSD rate table against
// silent drift. A wrong constant here is a wrong money figure shown to a live
// buyer — exactly the class of bug the affordability calculator shipped with
// (see calculator-rules.test.mjs) before it was caught.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'stamp-duty-calculator', 'index.html'), 'utf8');

const BSD_TIERS = [
  { upTo: 180000, rate: 0.01 },
  { upTo: 360000, rate: 0.02 },
  { upTo: 1000000, rate: 0.03 },
  { upTo: 1500000, rate: 0.04 },
  { upTo: 3000000, rate: 0.05 },
  { upTo: Infinity, rate: 0.06 },
];

function calcBSD(price) {
  if (price <= 0) return 0;
  let duty = 0;
  let lower = 0;
  for (const tier of BSD_TIERS) {
    if (price <= lower) break;
    const taxableInTier = Math.min(price, tier.upTo) - lower;
    duty += taxableInTier * tier.rate;
    lower = tier.upTo;
  }
  return duty;
}

const ABSD_RATES = {
  SC: { 1: 0.0, 2: 0.2, 3: 0.3 },
  PR: { 1: 0.05, 2: 0.3, 3: 0.35 },
  FR: { 1: 0.6, 2: 0.6, 3: 0.6 },
  EN: { 1: 0.65, 2: 0.65, 3: 0.65 },
};

function pageRoundDuty() {
  const source = html.match(/function roundDuty\(amount\) \{[\s\S]*?\n\}/);
  assert.ok(source, 'stamp-duty calculator has no IRAS round-down function');
  return Function(`"use strict"; ${source[0]}; return roundDuty;`)();
}

test('the BSD tier table in the page source matches the IRAS schedule (effective 15 Feb 2023)', () => {
  assert.match(html, /\{ upTo: 180000, rate: 0\.01 \}/);
  assert.match(html, /\{ upTo: 360000, rate: 0\.02 \}/);
  assert.match(html, /\{ upTo: 1000000, rate: 0\.03 \}/);
  assert.match(html, /\{ upTo: 1500000, rate: 0\.04 \}/);
  assert.match(html, /\{ upTo: 3000000, rate: 0\.05 \}/);
  assert.match(html, /\{ upTo: Infinity, rate: 0\.06 \}/);
});

test('the ABSD rate table in the page source matches the IRAS schedule (effective 27 Apr 2023)', () => {
  assert.match(html, /SC: \{ 1: 0\.00, 2: 0\.20, 3: 0\.30 \}/);
  assert.match(html, /PR: \{ 1: 0\.05, 2: 0\.30, 3: 0\.35 \}/);
  assert.match(html, /FR: \{ 1: 0\.60, 2: 0\.60, 3: 0\.60 \}/);
  assert.match(html, /EN: \{ 1: 0\.65, 2: 0\.65, 3: 0\.65 \}/);
});

test('BSD is computed correctly at each tier boundary', () => {
  assert.equal(calcBSD(100000), 1000);
  assert.equal(calcBSD(1000000), 24600);
  assert.equal(calcBSD(1500000), 44600);
  assert.equal(calcBSD(3000000), 119600);
  assert.equal(calcBSD(3500000), 149600);
});

test('ABSD is computed correctly for every buyer profile and property count', () => {
  const price = 1000000;
  assert.equal(price * ABSD_RATES.SC[1], 0);
  assert.equal(price * ABSD_RATES.SC[2], 200000);
  assert.equal(price * ABSD_RATES.SC[3], 300000);
  assert.equal(price * ABSD_RATES.PR[1], 50000);
  assert.equal(price * ABSD_RATES.PR[2], 300000);
  assert.equal(price * ABSD_RATES.PR[3], 350000);
  assert.equal(price * ABSD_RATES.FR[1], 600000);
  assert.equal(price * ABSD_RATES.EN[1], 650000);
});

test('total duty for a Singapore Citizen buying a first HDB flat is BSD only (ABSD exempt)', () => {
  const price = 500000;
  const total = calcBSD(price) + price * ABSD_RATES.SC[1];
  assert.equal(total, calcBSD(price));
  assert.equal(total, 9600);
});

test('a foreigner pays the flat 60% ABSD rate on top of BSD regardless of property count', () => {
  const price = 2000000;
  const totalAsFirst = calcBSD(price) + price * ABSD_RATES.FR[1];
  const totalAsThird = calcBSD(price) + price * ABSD_RATES.FR[3];
  assert.equal(totalAsFirst, totalAsThird);
  assert.equal(totalAsFirst, calcBSD(price) + 1200000);
});

test('BSD and ABSD are rounded down separately with the IRAS $1 minimum', () => {
  const roundDuty = pageRoundDuty();
  assert.equal(roundDuty(0), 0);
  assert.equal(roundDuty(0.01), 1);
  assert.equal(roundDuty(1.99), 1);

  const price = 999999;
  const bsd = roundDuty(calcBSD(price));
  const absd = roundDuty(price * ABSD_RATES.PR[1]);
  assert.equal(bsd, 24599);
  assert.equal(absd, 49999);
  assert.equal(bsd + absd, 74598);

  assert.match(html, /const bsd = roundDuty\(calcBSD\(price\)\);/);
  assert.match(html, /const absd = roundDuty\(price \* absdRate\);/);
  assert.match(html, /const total = bsd \+ absd;/);
});

// 26 Oct 2026 report: the page drew 302 impressions at position 58 for
// "stamp duty calculator", "bsd calculator", "absd calculator", "seller stamp
// duty calculator" and "stamp duty rates", but showed no rate tables. The
// tables below are hand-written HTML, so pin them to the rates the
// calculator actually uses, and pin the SSD table to IRAS (checked 26 Oct 2026).
const stripTags = (fragment) => fragment.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tableAfter = (heading) => {
  const at = html.indexOf(`<h3>${heading}</h3>`);
  assert.ok(at !== -1, `missing section: ${heading}`);
  const body = html.slice(html.indexOf('<tbody>', at), html.indexOf('</tbody>', at));
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => stripTags(cell)));
};
const pct = (rate) => `${Math.round(rate * 100)}%`;

test('the visible BSD rate table matches the calculator tiers', () => {
  const rows = tableAfter("Buyer's Stamp Duty (BSD) rates");
  assert.deepEqual(rows.map((row) => row[1]), BSD_TIERS.map((tier) => pct(tier.rate)));
  let lower = 0;
  BSD_TIERS.forEach((tier, i) => {
    const band = Number.isFinite(tier.upTo) ? tier.upTo - lower : null;
    if (band !== null) assert.match(rows[i][0], new RegExp(`\\$${band.toLocaleString('en-US')}$`), `row ${i + 1} band`);
    lower = tier.upTo;
  });
  assert.equal(calcBSD(600000), 12600);
  assert.equal(calcBSD(1500000), 44600);
  assert.match(html, /\$1,800 \+ \$3,600 \+ \$7,200 = <strong>\$12,600<\/strong>/);
  assert.match(html, /\$1,800 \+ \$3,600 \+ \$19,200 \+ \$20,000 = <strong>\$44,600<\/strong>/);
});

test('the visible ABSD rate table matches the calculator rates', () => {
  const rows = tableAfter("Additional Buyer's Stamp Duty (ABSD) rates");
  const order = [['Singapore Citizen', 'SC'], ['Singapore Permanent Resident', 'PR'], ['Foreigner', 'FR'], ['Entity', 'EN']];
  assert.equal(rows.length, order.length);
  order.forEach(([label, key], i) => {
    assert.equal(rows[i][0], label);
    assert.deepEqual(rows[i].slice(1), [1, 2, 3].map((count) => pct(ABSD_RATES[key][count])));
  });
});

test('the SSD table carries the IRAS rates for purchases from 4 Jul 2025', () => {
  const rows = tableAfter("Seller's Stamp Duty (SSD) rates");
  assert.deepEqual(rows.map((row) => row[1]), ['16%', '12%', '8%', '4%', 'None']);
  assert.deepEqual(rows.map((row) => row[2]), ['12%', '8%', '4%', 'None', 'None']);
});

test('visible FAQs exactly mirror the FAQPage structured data', () => {
  const schema = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((match) => JSON.parse(match[1])).find((node) => node['@type'] === 'FAQPage');
  assert.ok(schema, 'missing FAQPage');
  const visible = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
    .map(([, q, a]) => [stripTags(q).replaceAll('&amp;', '&'), stripTags(a).replaceAll('&amp;', '&')]);
  assert.deepEqual(visible, schema.mainEntity.map((entry) => [entry.name, entry.acceptedAnswer.text]));
  assert.equal(schema.mainEntity.length, 7);
});

test('the title and H1 name the calculator for the queries it ranks for', () => {
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.equal(title, 'Stamp Duty Calculator Singapore 2026: BSD, ABSD | PropertySG');
  assert.ok(title.length <= 60);
  assert.match(html, /<h1 id="page-hero-title">Stamp duty calculator: BSD and ABSD<\/h1>/);
});
