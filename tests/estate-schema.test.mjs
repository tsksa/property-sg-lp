import assert from 'node:assert/strict';
import test from 'node:test';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTownSchema, buildHubSchema, faqHtml, townFacts, titleCase } from '../scripts/lib/estate-schema.mjs';

// The Dataset/FAQPage JSON-LD must only ever restate numbers already rendered
// on the page — see scripts/generate-estate-pages.mjs stat-band. These tests
// pin that the builder derives its text from the same inputs, not invented
// figures, and that it degrades sensibly when there's no prior-year window.

const DATASET = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const API = 'https://data.gov.sg/api/action/datastore_search';
const window12 = ['2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11', '2025-10', '2025-09', '2025-08'];

test('town Dataset carries the exact stat-band numbers, not rounded/rederived ones', () => {
  const [dataset] = buildTownSchema({
    t: 'Ang Mo Kio',
    canonical: 'https://joetay.com/hdb-prices/ang-mo-kio/',
    generatedAt: '2026-07',
    window12,
    cur: { med: 517500, n: 892, psf: 585.4 },
    yoy: 5.6,
    DATASET,
    API,
  });
  assert.equal(dataset['@type'], 'Dataset');
  assert.equal(dataset.temporalCoverage, '2025-08/2026-07');
  const byName = Object.fromEntries(dataset.variableMeasured.map((v) => [v.name, v.value]));
  assert.equal(byName['Median resale price'], 517500);
  assert.equal(byName['Median price per square foot'], 585); // rounded, same as the page's $585 psf
  assert.equal(byName['Transaction count'], 892);
});

test('town FAQPage answers quote the same numbers as the Dataset', () => {
  const [, faq] = buildTownSchema({
    t: 'Bedok',
    canonical: 'https://joetay.com/hdb-prices/bedok/',
    generatedAt: '2026-07',
    window12,
    cur: { med: 545400, n: 1224, psf: 589 },
    yoy: -2.8,
    DATASET,
    API,
  });
  assert.equal(faq['@type'], 'FAQPage');
  assert.equal(faq.mainEntity.length, 3);
  const priceAnswer = faq.mainEntity[0].acceptedAnswer.text;
  assert.match(priceAnswer, /\$545,400/); // exact formatted median, not re-rounded
  assert.match(priceAnswer, /1224/);
  const yoyAnswer = faq.mainEntity[2].acceptedAnswer.text;
  assert.match(yoyAnswer, /fallen 2\.8%/);
});

test('a null YoY (insufficient prior-window data) never fabricates a percentage', () => {
  const [, faq] = buildTownSchema({
    t: 'Bukit Timah',
    canonical: 'https://joetay.com/hdb-prices/bukit-timah/',
    generatedAt: '2026-07',
    window12,
    cur: { med: 990000, n: 57, psf: 825 },
    yoy: null,
    DATASET,
    API,
  });
  const yoyAnswer = faq.mainEntity[2].acceptedAnswer.text;
  assert.doesNotMatch(yoyAnswer, /%/);
  assert.match(yoyAnswer, /not enough data|isn't enough data/);
});

test('hub schema identifies the actual highest/lowest median from indexRows, not a hardcoded town', () => {
  const indexRows = [
    { town: 'Ang Mo Kio', s: 'ang-mo-kio', med: 517500, n: 892 },
    { town: 'Bukit Timah', s: 'bukit-timah', med: 990000, n: 57 },
    { town: 'Woodlands', s: 'woodlands', med: 400000, n: 1786 },
  ];
  const [dataset, faq] = buildHubSchema({
    canonical: 'https://joetay.com/hdb-prices/',
    generatedAt: '2026-07',
    indexRows,
    DATASET,
    API,
  });
  const byName = Object.fromEntries(dataset.variableMeasured.map((v) => [v.name, v.value]));
  assert.equal(byName['Town count'], 3);
  assert.equal(byName['Total 12-month transaction count'], 892 + 57 + 1786);

  const highestQ = faq.mainEntity.find((q) => /highest/.test(q.name));
  const lowestQ = faq.mainEntity.find((q) => /lowest/.test(q.name));
  assert.match(highestQ.acceptedAnswer.text, /Bukit Timah/);
  assert.match(lowestQ.acceptedAnswer.text, /Woodlands/);
});

// Google requires FAQPage content to be visible on the page; JSON-LD-only Q&A
// risks a manual action for spammy structured data. The generator renders the
// visible block from the same node it serialises, so this pins that faqHtml
// reproduces every question and answer verbatim.
test('faqHtml renders every schema question and answer verbatim', async () => {
  const { faqHtml } = await import('../scripts/lib/estate-schema.mjs');
  const esc = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const [, faq] = buildTownSchema({
    t: 'Tampines',
    canonical: 'https://joetay.com/hdb-prices/tampines/',
    generatedAt: '2026-07',
    window12: ['2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02',
      '2026-01', '2025-12', '2025-11', '2025-10', '2025-09', '2025-08'],
    cur: { med: 545400, psf: 585, n: 1224 },
    yoy: -2.8,
    DATASET,
    API,
  });

  const html = faqHtml(faq, esc);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(esc(q.name)), `question not rendered: ${q.name}`);
    assert.ok(html.includes(esc(q.acceptedAnswer.text)), `answer not rendered: ${q.name}`);
  }
  assert.equal((html.match(/<details/g) || []).length, faq.mainEntity.length);
});

// JOE-448: with town names and numbers masked, 99.9% of town-page prose
// sentences appeared on 3+ town pages, and the psf question restated the value card. Town facts counted from the
// same 12-month rows replace it; without them the FAQ is unchanged.
const row = (street_name, resale_price, extra = {}) => ({
  street_name, resale_price: String(resale_price), month: '2026-07', flat_type: '4 ROOM', block: '1', storey_range: '04 TO 06', ...extra,
});

test('townFacts counts the busiest streets and finds the highest sale', () => {
  const inWin = [
    row('BEDOK RESERVOIR RD', 500000), row('BEDOK RESERVOIR RD', 510000), row('BEDOK RESERVOIR RD', 520000),
    row('BEDOK NTH RD', 400000), row('BEDOK NTH RD', 410000),
    row("QUEEN'S RD", 1200000, { flat_type: 'EXECUTIVE', block: '152C', storey_range: '10 TO 12', month: '2026-05' }),
    row('NEW UPPER CHANGI RD', 1200000, { flat_type: '5 ROOM', block: '9', storey_range: '07 TO 09', month: '2026-06' }),
    row('ALPHA ST', 300000),
  ];
  const facts = townFacts(inWin);
  assert.deepEqual(facts.topStreets, [
    { street: 'Bedok Reservoir Rd', sales: 3 },
    { street: 'Bedok Nth Rd', sales: 2 },
    // Streets tied with the third are all listed (up to 5), never cut alphabetically.
    { street: 'Alpha St', sales: 1 },
    { street: 'New Upper Changi Rd', sales: 1 },
    { street: "Queen's Rd", sales: 1 },
  ]);
  const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => row(`${name} ST`, 1));
  assert.equal(townFacts(many).topStreets.length, 5, 'a tie list is capped at 5');
  // A tie on price goes to the newer sale.
  assert.deepEqual(facts.highest, { price: 1200000, flatType: '5 Room', block: '9', street: 'New Upper Changi Rd', storeyRange: '7 to 9', month: '2026-06' });
  assert.equal(townFacts([row("QUEEN'S RD", 1)]).topStreets[0].street, "Queen's Rd");
  assert.equal(townFacts([row('LOR 1A TOA PAYOH', 1)]).highest.street, 'Lor 1A Toa Payoh');
});

test('titleCase keeps lettered numbers and possessives the way the dataset means them', () => {
  assert.equal(titleCase('LOR 1A TOA PAYOH'), 'Lor 1A Toa Payoh');
  assert.equal(titleCase("QUEEN'S RD"), "Queen's Rd");
  assert.equal(titleCase('KALLANG/WHAMPOA'), 'Kallang/Whampoa');
  assert.equal(titleCase('MULTI-GENERATION'), 'Multi-Generation');
  assert.equal(titleCase('BEDOK NTH ST 3'), 'Bedok Nth St 3');
  assert.equal(titleCase('3 ROOM'), '3 Room');
});

test('with facts, the psf question gives way to streets and the highest sale; year on year stays third', () => {
  const base = { t: 'Bedok', canonical: 'https://joetay.com/hdb-prices/bedok/', generatedAt: '2026-07', window12, cur: { med: 545400, n: 1224, psf: 589 }, yoy: -2.8, DATASET, API };
  const [, plain] = buildTownSchema(base);
  assert.equal(plain.mainEntity.length, 3);
  assert.match(plain.mainEntity[1].name, /price per square foot/);

  const facts = {
    topStreets: [{ street: 'Bedok Reservoir Rd', sales: 227 }, { street: 'Bedok Nth Rd', sales: 140 }, { street: 'Bedok Nth St 3', sales: 101 }],
    highest: { price: 1458888, flatType: 'Executive', block: '152C', street: 'Bedok Sth Rd', storeyRange: '10 to 12', month: '2026-06' },
  };
  const [, faq] = buildTownSchema({ ...base, facts });
  assert.deepEqual(faq.mainEntity.map((q) => q.name), [
    'What is the median HDB resale price in Bedok?',
    'Which streets in Bedok have the most HDB resale sales?',
    'Have HDB prices in Bedok gone up or down over the past year?',
    'What was the highest HDB resale price in Bedok in the last 12 months?',
  ]);
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, plain.mainEntity[0].acceptedAnswer.text);
  assert.match(faq.mainEntity[1].acceptedAnswer.text, /Bedok Reservoir Rd \(227 sales\), Bedok Nth Rd \(140 sales\) and Bedok Nth St 3 \(101 sales\), out of 1224 sales/);
  assert.match(faq.mainEntity[2].acceptedAnswer.text, /fallen 2\.8%/);
  assert.equal(
    faq.mainEntity[3].acceptedAnswer.text,
    '$1,458,888, for an Executive flat at Blk 152C Bedok Sth Rd, storeys 10 to 12, sold in 2026-06. It is the highest of 1224 registered resale transactions in Bedok in the 12 months to 2026-07.',
  );
  assert.ok(!faq.mainEntity.some((q) => /psf/.test(q.name)));
});

test("a town page's visible FAQ and FAQPage JSON-LD carry the same town facts", () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const html = fs.readFileSync(path.join(ROOT, 'hdb-prices', 'bedok', 'index.html'), 'utf8');
  const faq = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .flatMap((node) => node['@graph'] || [node])
    .find((node) => node['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 4);
  assert.match(faq.mainEntity[1].name, /^Which streets in Bedok have the most HDB resale sales\?$/);
  assert.match(faq.mainEntity[3].name, /^What was the highest HDB resale price in Bedok in the last 12 months\?$/);
  const esc = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  assert.ok(html.includes(faqHtml(faq, esc)), 'visible FAQ differs from the FAQPage JSON-LD');
});
