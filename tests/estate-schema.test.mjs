import assert from 'node:assert/strict';
import test from 'node:test';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTownSchema, buildHubSchema, faqHtml, townFacts, titleCase } from '../scripts/lib/estate-schema.mjs';
import {
  DETAIL_BUDGET, MIN_TYPE_SALES, blockIndex, flatModelBlock, rentalSection, townDescription, typeStats,
} from '../scripts/lib/estate-sections.mjs';

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

test('hub schema identifies the actual highest median and the cheapest town per flat type', () => {
  const indexRows = [
    { town: 'Ang Mo Kio', s: 'ang-mo-kio', med: 517500, n: 892, types: { '3 ROOM': { med: 420000, n: 400 }, '4 ROOM': { med: 615000, n: 300 } } },
    { town: 'Bukit Timah', s: 'bukit-timah', med: 990000, n: 57, types: { '4 ROOM': { med: 938000, n: 20 }, '3 ROOM': { med: 300000, n: 4 } } },
    { town: 'Jurong West', s: 'jurong-west', med: 560000, n: 1470, types: { '3 ROOM': { med: 430000, n: 300 }, '4 ROOM': { med: 535000, n: 600 } } },
  ];
  const [dataset, faq] = buildHubSchema({
    canonical: 'https://joetay.com/hdb-prices/',
    generatedAt: '2026-07',
    indexRows,
    DATASET,
    API,
    dateModified: '2026-08-03',
  });
  const byName = Object.fromEntries(dataset.variableMeasured.map((v) => [v.name, v.value]));
  assert.equal(byName['Town count'], 3);
  assert.equal(byName['Total 12-month transaction count'], 892 + 1470 + 57);
  assert.equal(dataset.dateModified, '2026-08-03');

  const highestQ = faq.mainEntity.find((q) => /highest/.test(q.name));
  assert.match(highestQ.acceptedAnswer.text, /Bukit Timah/);
  // JOE-469: no all-flat-types "lowest median" answer; one per flat type.
  assert.ok(!faq.mainEntity.some((q) => /lowest/.test(q.name)));
  const cheapest = (label) => faq.mainEntity.find((q) => q.name === `Which town has the cheapest ${label} HDB resale flats?`);
  assert.match(cheapest('4-room').acceptedAnswer.text, /^Jurong West, with a median 4-room resale price of \$535,000 across 600 sales/);
  // Bukit Timah's 3-room median is lower but rests on 4 sales, so it is not compared.
  assert.match(cheapest('3-room').acceptedAnswer.text, /^Ang Mo Kio, with a median 3-room resale price of \$420,000/);
  assert.equal(cheapest('5-room'), undefined, 'no town has 5-room data here');
});

test('hub FAQ gives the Singapore median and a like-for-like answer, never a forecast', () => {
  const indexRows = [{ town: 'Bedok', s: 'bedok', med: 545400, n: 1224, types: {} }];
  const base = { canonical: 'https://joetay.com/hdb-prices/', generatedAt: '2026-07', indexRows, DATASET, API };
  const singapore = { med: 600000, n: 25000, yoy: -1.2, types: { '4 ROOM': { med: 610000, n: 11000 } } };
  const [, faq] = buildHubSchema({ ...base, singapore });
  const sg = faq.mainEntity.find((q) => q.name === 'What is the median HDB resale price in Singapore?');
  assert.equal(sg.acceptedAnswer.text, '$600,000, across 25,000 registered HDB resale transactions in the 12 months to 2026-07. By flat type: 4-room $610,000.');
  const down = faq.mainEntity.find((q) => q.name === 'Are HDB resale prices going down in 2026?');
  assert.match(down.acceptedAnswer.text, /^Yes\. Like for like, HDB resale prices across Singapore have fallen 1\.2%/);
  assert.match(down.acceptedAnswer.text, /not a forecast/);
  const [, flat] = buildHubSchema({ ...base, singapore: { ...singapore, yoy: null } });
  assert.doesNotMatch(flat.mainEntity.find((q) => /going down/.test(q.name)).acceptedAnswer.text, /%/);
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
  // Four town questions, then one per flat type with a section on the page.
  const sections = [...html.matchAll(/<section data-est="type" id="([^"]+)">/g)].length;
  assert.ok(sections >= 3, `only ${sections} flat-type sections on Bedok`);
  assert.equal(faq.mainEntity.length, 4 + sections);
  assert.ok(faq.mainEntity.slice(4).every((q) => /^How much is an? .+ resale flat in Bedok in \d{4}\?$/.test(q.name)));
  assert.match(faq.mainEntity[1].name, /^Which streets in Bedok have the most HDB resale sales\?$/);
  assert.match(faq.mainEntity[3].name, /^What was the highest HDB resale price in Bedok in the last 12 months\?$/);
  const esc = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  assert.ok(html.includes(faqHtml(faq, esc)), 'visible FAQ differs from the FAQPage JSON-LD');
});

// JOE-345: every town page used one template and differed only in its figures;
// Google crawled /hdb-prices/bedok/ on 15 Oct 2026 and chose not to index it.
// Each page now carries a street breakdown no other town page has.
test('every town page breaks prices down by its own streets', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const towns = fs.readdirSync(path.join(ROOT, 'hdb-prices'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.ok(towns.length >= 26, `expected the town pages, found ${towns.length}`);
  const tables = new Set();
  for (const town of towns) {
    const html = fs.readFileSync(path.join(ROOT, 'hdb-prices', town, 'index.html'), 'utf8');
    const at = html.indexOf('HDB resale prices by street</h2>');
    assert.ok(at !== -1, `${town}: missing the by-street table`);
    const table = html.slice(at, html.indexOf('</table>', at));
    const rows = table.match(/<tr><td style="text-align:left">/g) || [];
    assert.ok(rows.length >= 2, `${town}: only ${rows.length} streets listed`);
    tables.add(table.replace(/^[^<]*<\/h2>/, ''));
  }
  assert.equal(tables.size, towns.length, 'two towns rendered an identical street table');
});

// ── JOE-469: flat types, flat models, blocks, rents and freshness ──

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const townDirs = () => fs.readdirSync(path.join(ROOT, 'hdb-prices'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const readTown = (town) => fs.readFileSync(path.join(ROOT, 'hdb-prices', town, 'index.html'), 'utf8');
const readHub = () => fs.readFileSync(path.join(ROOT, 'hdb-prices', 'index.html'), 'utf8');
const ldNodes = (html) => [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
  .map((m) => JSON.parse(m[1]))
  .flatMap((node) => node['@graph'] || [node]);
const decode = (s) => s.replace(/&amp;/g, '&');
const esc = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const sale = (extra) => ({
  month: '2026-07', town: 'YISHUN', flat_type: '4 ROOM', block: '1', street_name: 'YISHUN RING RD', storey_range: '04 TO 06',
  floor_area_sqm: '93', flat_model: 'Model A', lease_commence_date: '1988', remaining_lease: '61 years 02 months', resale_price: '500000', ...extra,
});

test('every flat type with enough sales gets its own section, headed the way people search', () => {
  for (const town of townDirs()) {
    const html = readTown(town);
    const table = html.split('<h2>Median price by flat type (last 12 months)</h2>')[1].split('</table>')[0];
    const rows = [...table.matchAll(/<tr><td>(?:<a href="#([^"]+)">)?([^<]+)(?:<\/a>)?<\/td><td>[^<]+<\/td><td>[^<]+<\/td><td>(\d+)<\/td><\/tr>/g)];
    assert.ok(rows.length >= 2, `${town}: flat-type table not found`);
    for (const [, id, , n] of rows) {
      if (Number(n) < MIN_TYPE_SALES) continue;
      assert.ok(id, `${town}: a flat type with ${n} sales is not linked to a section`);
      const h2 = html.match(new RegExp(`<section data-est="type" id="${id}">\\s*<h2>How much is an? [^<]+ HDB resale flat in [^<]+\\?</h2>`));
      assert.ok(h2, `${town}: no "How much is a … HDB resale flat" section for #${id}`);
    }
  }
});

test('typeStats keeps only flat types with enough sales and reports their range', () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => sale({ resale_price: String(500000 + i * 10000) })),
    ...Array.from({ length: 9 }, () => sale({ flat_type: '3 ROOM' })),
  ];
  const types = typeStats(rows);
  assert.deepEqual(types.map((s) => s.id), ['4-room']);
  assert.equal(types[0].n, 10);
  assert.equal(types[0].med, 545000);
  assert.equal(types[0].lowest.resale_price, '500000');
  assert.equal(types[0].highest.resale_price, '590000');
});

test('the maisonette block appears only when a model has enough sales', () => {
  const four = Array.from({ length: 4 }, () => sale({ flat_type: 'EXECUTIVE', flat_model: 'Maisonette' }));
  assert.equal(flatModelBlock({ t: 'Yishun', inWin: four, esc }), '');
  const five = [...four, sale({ flat_type: 'EXECUTIVE', flat_model: 'Maisonette' })];
  const block = flatModelBlock({ t: 'Yishun', inWin: five, esc });
  assert.match(block, /<h2>Maisonettes in Yishun<\/h2>/);
  assert.match(block, /<tr><td>Maisonette<\/td><td>\$500,000<\/td><td>93 sqm<\/td><td>5<\/td><\/tr>/);
  // Yishun has traded maisonettes for years; its page must say so.
  assert.match(readTown('yishun'), /<h2>Maisonettes[^<]* in Yishun<\/h2>/);
  assert.ok(/maisonette/i.test(readTown('yishun')));
});

test('flat-model headings start with a capital letter', () => {
  const rows = [
    ...Array.from({ length: 5 }, () => sale({ flat_type: '3 ROOM', flat_model: 'Adjoined flat' })),
    ...Array.from({ length: 5 }, () => sale({ flat_type: 'EXECUTIVE', flat_model: 'Premium Apartment Loft' })),
  ];
  const block = flatModelBlock({ t: 'Ang Mo Kio', inWin: rows, esc });
  assert.match(block, /<h2>Jumbo flats and other flat models in Ang Mo Kio<\/h2>/);
  for (const town of townDirs()) {
    const h2 = readTown(town).match(/<section data-est="models"[^>]*>\s*<h2>(.)/);
    if (h2) assert.match(h2[1], /[A-Z]/, `${town}: flat-model heading starts lower case`);
  }
});

test('pages with rents credit the rental dataset under the Open Data Licence', () => {
  const rentUrl = 'https://data.gov.sg/datasets/d_c9f57187485a850908655db0e8cfe651/view';
  let seen = 0;
  for (const town of townDirs()) {
    const html = readTown(town);
    const section = html.match(/<section data-est="rent"[\s\S]*?<\/section>/);
    const dataset = ldNodes(html).find((node) => node['@type'] === 'Dataset');
    if (!section) {
      assert.equal(typeof dataset.isBasedOn, 'string', `${town}: no rents shown but the rental dataset is cited`);
      continue;
    }
    seen += 1;
    assert.match(section[0], /Renting Out of Flats<\/a> dataset accessed via data\.gov\.sg, made available under the <a href="https:\/\/data\.gov\.sg\/open-data-licence"[^>]*>Singapore Open Data Licence v1\.0<\/a>/, town);
    assert.ok(Array.isArray(dataset.isBasedOn) && dataset.isBasedOn.includes(rentUrl), `${town}: Dataset isBasedOn lacks the rental dataset`);
  }
  assert.ok(seen > 0, 'no town page shows rents');
});

test('the block index lists blocks with at least the stated sales, grouped by street, collapsed', () => {
  const rows = [
    sale({ block: '510A', street_name: 'YISHUN ST 51' }), sale({ block: '510A', street_name: 'YISHUN ST 51', month: '2026-06' }),
    sale({ block: '511', street_name: 'YISHUN ST 51' }),
  ];
  const { html, blocks } = blockIndex({ t: 'Yishun', inWin: rows, latestFullMonth: '2026-07', esc, minSales: 2 });
  assert.equal(blocks, 1);
  assert.match(html, /<details class="blk"><summary>Yishun St 51 · 1 block, 2 sales<\/summary>/);
  assert.match(html, /<tr id="blk-510a"><td>510A<\/td><td>1988<\/td><td>2<\/td><td>Jul 2026 · 4-room · 4 to 6 · \$500,000<\/td>/);
  assert.doesNotMatch(html, /blk-511/);
  assert.match(html, /href="\/neighbour-prices\/"/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  for (const town of townDirs()) {
    const page = readTown(town);
    const stated = page.match(/block with at least (\d+) resale sales/);
    assert.ok(stated && Number(stated[1]) >= 2, `${town}: block index missing or below 2 sales a block`);
  }
});

test('the detail sections stay within their byte budget on every town page', () => {
  for (const town of townDirs()) {
    const html = readTown(town);
    const added = [...html.matchAll(/<section data-est="\w+"[\s\S]*?<\/section>/g)]
      .reduce((sum, m) => sum + Buffer.byteLength(m[0]), 0);
    assert.ok(added > 0, `${town}: no detail sections`);
    assert.ok(added <= DETAIL_BUDGET, `${town}: detail sections are ${added} bytes, budget ${DETAIL_BUDGET}`);
    // About 25KB over the pre-JOE-469 pages (36–39KB) at most.
    assert.ok(Buffer.byteLength(html) <= 65 * 1024, `${town}: page is ${Buffer.byteLength(html)} bytes`);
  }
});

test('rents need enough approvals and the yield is labelled indicative', () => {
  const rents = [
    ...Array.from({ length: 10 }, () => ({ flat_type: '4-ROOM', monthly_rent: '3000' })),
    ...Array.from({ length: 9 }, () => ({ flat_type: '3-ROOM', monthly_rent: '2500' })),
  ];
  const types = [{ ft: '4 ROOM', med: 600000 }];
  const html = rentalSection({ t: 'Yishun', rents, rentMonths: ['2026-07', '2025-08'], types, esc });
  assert.match(html, /<tr><td>4-room<\/td><td>\$3,000<\/td><td>10<\/td><td>6\.0%<\/td><\/tr>/);
  assert.doesNotMatch(html, /3-room/);
  assert.match(html, /Indicative gross yield/);
  assert.match(html, /Thinking of renting out your Yishun flat\?<\/strong> <a href="\/rent-out\/">/);
  assert.match(html, /Aug 2025 to Jul 2026/);
  assert.equal(rentalSection({ t: 'Yishun', rents: rents.slice(0, 9), rentMonths: ['2026-07'], types, esc }), '');
});

test('descriptions lead with flat-type medians, end in a full stop and fit 160 characters', () => {
  const types = [
    { ft: '3 ROOM', label: '3-room', med: 433000 }, { ft: '4 ROOM', label: '4-room', med: 550000 },
    { ft: '5 ROOM', label: '5-room', med: 1108000 },
  ];
  assert.equal(
    townDescription({ t: 'Yishun', types, n: 1575, latestFullMonth: '2026-09' }),
    'Yishun HDB resale prices: 3-room $433k, 4-room $550k, 5-room $1.11m median (1,575 sales, 12 months to Sep 2026). Sold prices by street and block.',
  );
  for (const town of townDirs()) {
    const desc = decode(readTown(town).match(/<meta name="description" content="([^"]*)">/)[1]);
    assert.ok(desc.length <= 160, `${town}: description is ${desc.length} characters`);
    assert.ok(desc.endsWith('.'), `${town}: description does not end in a full stop`);
    assert.match(desc, /\d-room \$/, `${town}: description has no flat-type median`);
  }
});

test('titles carry the flat-type wording; no title or H1 says "for sale"', () => {
  for (const town of [...townDirs()]) {
    const html = readTown(town);
    const title = decode(html.match(/<title>([^<]*)<\/title>/)[1]);
    assert.match(title, /HDB Resale Prices (\d{4} )?by Flat Type \| PropertySG$/);
    assert.ok(title.length <= 60, `${town}: title is ${title.length} characters`);
    // price-links.mjs and patch-new-launches-block.mjs read the town from this H1.
    assert.match(html, /<h1>[^<]+ HDB resale prices<\/h1>/);
  }
  for (const html of [...townDirs().map(readTown), readHub()]) {
    assert.doesNotMatch(html.match(/<title>[^<]*<\/title>/)[0], /for sale/i);
    assert.doesNotMatch(html.match(/<h1>[^<]*<\/h1>/)[0], /for sale/i);
  }
});

test('pages show the data month and mark dateModified on the WebPage and Dataset nodes', () => {
  for (const html of [...townDirs().map(readTown), readHub()]) {
    assert.match(html, /<p class="src">Data to [A-Z][a-z]{2} \d{4} \(data\.gov\.sg\)/);
    const nodes = ldNodes(html);
    const page = nodes.find((n) => n['@type'] === 'WebPage');
    const dataset = nodes.find((n) => n['@type'] === 'Dataset');
    assert.match(page.dateModified, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(dataset.dateModified, page.dateModified);
    assert.equal(dataset.isAccessibleForFree, true);
    // One agent entity across the site: the homepage's RealEstateAgent node.
    assert.equal(page.publisher['@id'], 'https://joetay.com/#agent');
    assert.equal(page.publisher['@type'], 'RealEstateAgent');
  }
  const home = ldNodes(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  assert.ok(home.some((n) => n['@id'] === 'https://joetay.com/#agent' && n['@type'] === 'RealEstateAgent'));
});

test('the hub tables every town plus Singapore, and its FAQ names the cheapest town per flat type', () => {
  const html = readHub();
  const table = html.match(/<table id="town-table">[\s\S]*?<\/table>/)[0];
  const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rows = [...body.matchAll(/<tr><td data-v="[^"]*"><a href="\/hdb-prices\/([a-z-]+)\/">([^<]+)<\/a><\/td>([\s\S]*?)<\/tr>/g)];
  assert.equal(rows.length, townDirs().length);
  assert.match(table.match(/<tfoot>[\s\S]*<\/tfoot>/)[0], /<tr><td>Singapore<\/td>/);
  assert.equal(rows.length + 1, 27, 'expected 26 towns and a Singapore row');

  const heads = [...table.match(/<thead>[\s\S]*?<\/thead>/)[0].matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]);
  const faq = ldNodes(html).find((n) => n['@type'] === 'FAQPage');
  for (const label of ['3-room', '4-room', '5-room']) {
    const col = heads.indexOf(label);
    const ranked = rows
      .map(([, , town, cells]) => ({ town: decode(town), v: [...cells.matchAll(/data-v="([^"]*)"/g)][col - 1][1] }))
      .filter((r) => r.v !== '')
      .sort((a, b) => Number(a.v) - Number(b.v));
    const q = faq.mainEntity.find((item) => item.name === `Which town has the cheapest ${label} HDB resale flats?`);
    assert.ok(q, `hub FAQ has no cheapest-${label} question`);
    assert.ok(q.acceptedAnswer.text.startsWith(`${ranked[0].town}, `), `cheapest ${label}: FAQ says "${q.acceptedAnswer.text.slice(0, 30)}", table says ${ranked[0].town}`);
  }
  assert.ok(!faq.mainEntity.some((q) => /lowest median/.test(q.name)));
  assert.ok(html.includes(faqHtml(faq, esc)), 'visible hub FAQ differs from the FAQPage JSON-LD');
  assert.match(html, /<h2>Selling\? Check what flats like yours transacted for<\/h2>[\s\S]*?href="\/valuation\.html"/);
});
