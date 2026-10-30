import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  isCondoResale, toYearMonth, windowStats, median, psf, bandFor, SQM_TO_SQFT,
  tenureLabel, tenureKind, minProjectSales, projectAnchor, projectRows, tenureSplit,
  trimSentence, districtDescription, monthLabel, dateLabel, launchDetail,
} from '../scripts/lib/condo-stats.mjs';
import { DISTRICTS } from '../scripts/lib/condo-districts.mjs';
import { projectFaqs, tenureFaq, buildDistrictSchema } from '../scripts/lib/condo-schema.mjs';
import { POSTAL_SECTORS, DISTRICT_TOWNS, hdbTownsForDistrict } from '../scripts/lib/district-town-map.mjs';

// The condo pages show money figures a live buyer or seller may act on, built
// from URA caveat rows. These tests pin the population rules (what counts as a
// "condo resale") and the money math, network-free.

const row = (over = {}) => ({
  propertyType: 'Condominium', typeOfSale: '3', noOfUnits: '1',
  price: '1500000', area: '85', contractDate: '0726', district: '15', ...over,
});

test('population: condo/apartment resale, single-unit only', () => {
  assert.ok(isCondoResale(row()));
  assert.ok(isCondoResale(row({ propertyType: 'Apartment' })));
  // exclusions, each for a stated reason
  assert.ok(!isCondoResale(row({ propertyType: 'Executive Condominium' })), 'EC is HDB-adjacent');
  assert.ok(!isCondoResale(row({ propertyType: 'Terrace' })), 'landed is not condo prices');
  assert.ok(!isCondoResale(row({ typeOfSale: '1' })), 'new sales belong to the launches cluster');
  assert.ok(!isCondoResale(row({ typeOfSale: '2' })), 'sub sales excluded');
  assert.ok(!isCondoResale(row({ noOfUnits: '3' })), 'bulk deals would move a median');
  assert.ok(!isCondoResale(row({ price: '0' })));
  assert.ok(!isCondoResale(row({ area: '0' })));
});

test('URA contractDate MMYY converts to YYYY-MM', () => {
  assert.equal(toYearMonth('0726'), '2026-07');
  assert.equal(toYearMonth('1221'), '2021-12');
  assert.equal(toYearMonth('bad'), null);
  assert.equal(toYearMonth(undefined), null);
});

test('psf converts sqm at the exact factor shared with the estate pages', () => {
  assert.equal(SQM_TO_SQFT, 10.7639);
  // $1.5m for 85 sqm = 914.9 sqft → $1,639.55 psf
  assert.ok(Math.abs(psf(row()) - 1500000 / (85 * 10.7639)) < 1e-9);
});

test('window stats: median over the window months only', () => {
  const rows = [
    row({ price: '1000000', contractDate: '0726' }),
    row({ price: '2000000', contractDate: '0626' }),
    row({ price: '9000000', contractDate: '0120' }), // outside window
  ];
  const s = windowStats(rows, ['2026-07', '2026-06']);
  assert.equal(s.n, 2);
  assert.equal(s.med, 1500000);
  assert.equal(median([]), null, 'no data must be null, never zero');
});

test('size bands are contiguous and every row lands in exactly one', () => {
  assert.equal(bandFor(row({ area: '60' })).label, 'Up to 700 sqft');       // 645 sqft
  assert.equal(bandFor(row({ area: '85' })).label, '701–1,000 sqft');       // 915 sqft
  assert.equal(bandFor(row({ area: '120' })).label, '1,001–1,400 sqft');    // 1,292 sqft
  assert.equal(bandFor(row({ area: '200' })).label, 'Above 1,400 sqft');    // 2,153 sqft
});

test('district table covers all 28 postal districts with names', () => {
  assert.equal(Object.keys(DISTRICTS).length, 28);
  for (let i = 1; i <= 28; i++) {
    const key = String(i).padStart(2, '0');
    assert.ok(DISTRICTS[key]?.length > 3, `D${key} missing`);
  }
});

// ── District page builders (WS2): synthetic rows only, no URA key ──

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEASE = (y) => `99 yrs lease commencing from ${y}`;
const sale = (project, over = {}) => row({ project, street: `${project} Road`, tenure: 'Freehold', ...over });

test('tenure: URA wording shortened for the table and grouped for the split', () => {
  assert.equal(tenureLabel('Freehold'), 'Freehold');
  assert.equal(tenureLabel(LEASE(2012)), '99 yrs from 2012');
  assert.equal(tenureLabel('999 yrs lease commencing from 1885'), '999 yrs from 1885');
  assert.equal(tenureLabel('NA'), 'NA', 'unknown wording is shown as URA wrote it');
  assert.equal(tenureLabel(undefined), '—');
  assert.equal(tenureKind('Freehold'), 'freehold');
  assert.equal(tenureKind('999 yrs lease commencing from 1885'), 'freehold');
  assert.equal(tenureKind('9999 yrs lease commencing from 1826'), 'freehold', 'counted with freehold, as tenureBand does');
  assert.equal(tenureLabel('9999 yrs lease commencing from 1826'), '9999 yrs from 1826');
  assert.equal(tenureKind(LEASE(2012)), 'leasehold');
  assert.equal(tenureKind('103 yrs lease commencing from 1996'), 'other');
  assert.equal(tenureKind(''), null);
});

test('project rows: grouped by project, floored, sorted by sales, unique anchors', () => {
  const rows = [
    sale('Alpha Residences', { price: '1000000', contractDate: '0326' }),
    sale('Alpha Residences', { price: '2000000', contractDate: '0726' }),
    sale('Alpha Residences', { price: '1500000', contractDate: '0526', tenure: LEASE(2010) }),
    sale('Beta Court', { price: '3000000', area: '100' }),
    sale('Beta Court', { price: '3200000', area: '100', contractDate: '0826' }),
    sale('Gamma', { price: '900000' }), // one sale: under the floor
  ];
  const out = projectRows(rows, 2);
  assert.deepEqual(out.map((p) => p.project), ['Alpha Residences', 'Beta Court']);
  const [alpha, beta] = out;
  assert.equal(alpha.n, 3);
  assert.equal(alpha.med, 1500000);
  assert.equal(alpha.latest, '2026-07');
  assert.equal(alpha.tenure, 'Freehold', 'most common tenure wins');
  assert.equal(alpha.street, 'Alpha Residences Road');
  assert.equal(alpha.id, 'p-alpha-residences');
  assert.equal(beta.latest, '2026-08');
  assert.ok(Math.abs(beta.psf - 3100000 / (100 * SQM_TO_SQFT)) < 1e-9);
  assert.equal(projectRows(rows, 3).length, 1, 'floor of 3 keeps only Alpha');
  // two URA projects whose names slug the same still get distinct anchors
  const clash = projectRows([sale('The Tre-Ver'), sale('The Tre-Ver'), sale('THE TRE VER', { street: 'Other Rd' }), sale('THE TRE VER', { street: 'Other Rd' })], 2);
  assert.deepEqual(clash.map((p) => p.id).sort(), ['p-the-tre-ver', 'p-the-tre-ver-2']);
  // one URA project recorded under two streets is one row, on its most common street
  const split = projectRows([
    sale('Kappa', { street: 'Kappa Road' }), sale('Kappa', { street: 'Kappa Road' }), sale('Kappa', { street: 'Kappa Lane' }),
  ], 2);
  assert.equal(split.length, 1);
  assert.equal(split[0].n, 3);
  assert.equal(split[0].street, 'Kappa Road');
  assert.equal(minProjectSales(149), 2);
  assert.equal(minProjectSales(150), 3);
  assert.equal(projectAnchor('#1 Loft'), 'p-1-loft');
});

test('tenure split shows only when each side has at least 5 sales', () => {
  const fh = Array.from({ length: 5 }, () => sale('F', { price: '2000000' }));
  const lh = Array.from({ length: 5 }, () => sale('L', { price: '1500000', tenure: LEASE(2015) }));
  const odd = sale('O', { tenure: '103 yrs lease commencing from 1996', price: '9000000' });
  const s = tenureSplit([...fh, ...lh, odd]);
  assert.equal(s.shown, true);
  assert.equal(s.freehold.n, 5);
  assert.equal(s.leasehold.n, 5, 'a 103-year lease is in neither side');
  assert.equal(s.freehold.med, 2000000);
  assert.equal(tenureSplit([...fh, ...lh.slice(1)]).shown, false);
});

test('description: figures first, at most 160 characters, ends with a full stop', () => {
  const d15 = districtDescription({ dn: 15, area: 'East Coast', med: 2145000, psf: 1836.4, n: 1009 });
  assert.equal(d15, 'District 15 (East Coast) condo resale prices: 12-month median $2,145,000, $1,836 psf across 1,009 URA caveats. By size and project; updated monthly.');
  for (const [dn, area] of Object.entries(DISTRICTS)) {
    for (const med of [650000, 12345678]) {
      const desc = districtDescription({ dn: Number(dn), area: area.split(',')[0], med, psf: 12345, n: 12345 });
      assert.ok(desc.length <= 160, `D${dn}: ${desc.length} chars`);
      assert.ok(desc.endsWith('.'), `D${dn}: ${desc}`);
      assert.match(desc, /median \$[\d,]+, \$[\d,]+ psf across [\d,]+ URA caveats/);
    }
  }
  // no project table on the page, so the description does not promise one
  const thin = districtDescription({ dn: 15, area: 'East Coast', med: 2145000, psf: 1836.4, n: 40, hasProjects: false });
  assert.equal(thin, 'District 15 (East Coast) condo resale prices: 12-month median $2,145,000, $1,836 psf across 40 URA caveats. By size; updated monthly.');
  // a very long area name drops the closing sentence before anything else
  const long = districtDescription({ dn: 21, area: 'X'.repeat(40), med: 1e6, psf: 1500, n: 300 });
  assert.ok(long.length <= 160 && long.endsWith('.'));
  assert.match(long, /URA caveats\.$/);
});

test('trimSentence cuts on a word boundary and always ends with a full stop', () => {
  const words = 'alpha beta gamma delta '.repeat(20);
  const out = trimSentence(words, 60);
  assert.ok(out.length <= 60);
  assert.ok(out.endsWith('.'));
  assert.match(out, /(alpha|beta|gamma|delta)\.$/, 'no word cut in half');
  assert.equal(trimSentence('Short line', 160), 'Short line.');
  assert.equal(trimSentence('Ends here.', 10), 'Ends here.');
});

test('date labels for the freshness line', () => {
  assert.equal(monthLabel('2026-09'), 'Sep 2026');
  assert.equal(dateLabel('2026-10-30'), '30 Oct 2026');
});

const PROJECTS = [
  { project: 'Alpha', n: 9, psf: 2100, med: 2e6 },
  { project: 'Beta', n: 6, psf: 1500, med: 1.4e6 },
  { project: 'Gamma', n: 4, psf: 2500, med: 3e6 },
  { project: 'Delta', n: 3, psf: 1900, med: 1.7e6 },
];

test('project FAQs name the highest and lowest $psf projects from the table rows', () => {
  const [high, low] = projectFaqs({ dn: 15, projects: PROJECTS, generatedAt: '2026-09', minSales: 3 });
  assert.equal(high.name, 'Which condos in District 15 have the highest $psf?');
  assert.match(high.acceptedAnswer.text, /Gamma \(\$2,500 psf, 4 sales\), Alpha \(\$2,100 psf, 9 sales\) and Delta \(\$1,900 psf, 3 sales\)/);
  assert.match(high.acceptedAnswer.text, /at least 3 resale caveats in the 12 months to 2026-09/);
  assert.equal(low.name, 'What is the cheapest condo in District 15 by $psf?');
  assert.match(low.acceptedAnswer.text, /Beta had the lowest median at \$1,500 psf across 6 sales/);
  assert.deepEqual(projectFaqs({ dn: 15, projects: [], generatedAt: '2026-09', minSales: 3 }), []);
});

test('project FAQs with few projects never name the cheapest as a highest', () => {
  const args = { dn: 15, generatedAt: '2026-09', minSales: 2 };
  assert.deepEqual(projectFaqs({ ...args, projects: PROJECTS.slice(0, 1) }), [], 'one project: no highest-vs-cheapest pair');
  const [high2, low2] = projectFaqs({ ...args, projects: PROJECTS.slice(0, 2) });
  assert.match(high2.acceptedAnswer.text, /the highest median price per square foot was Alpha \(\$2,100 psf, 9 sales\)\. The median is not adjusted/);
  assert.doesNotMatch(high2.acceptedAnswer.text, /Beta/);
  assert.match(low2.acceptedAnswer.text, /Beta had the lowest median/);
  const [high3, low3] = projectFaqs({ ...args, projects: PROJECTS.slice(0, 3) });
  assert.match(high3.acceptedAnswer.text, /were Gamma \(\$2,500 psf, 4 sales\) and Alpha \(\$2,100 psf, 9 sales\)\. These medians/);
  assert.doesNotMatch(high3.acceptedAnswer.text, /Beta/);
  assert.match(low3.acceptedAnswer.text, /Beta had the lowest median/);
});

test('launch entries tag ECs and date the catalogue status', () => {
  const ec = { location: 'Pasir Ris', propertyType: 'executive-condominium', status: 'selling', verifiedAt: '2026-09-16' };
  assert.equal(launchDetail(ec), 'Pasir Ris · EC · Selling now (as of 16 Sep 2026)');
  assert.equal(launchDetail({ ...ec, propertyType: 'condominium', status: 'upcoming' }), 'Pasir Ris · Upcoming (as of 16 Sep 2026)');
  assert.equal(launchDetail({ ...ec, propertyType: 'condominium', verifiedAt: undefined }), 'Pasir Ris', 'no date, no status');
});

test('freehold FAQ appears only with a shown split and states the gap honestly', () => {
  const split = { shown: true, freehold: { n: 40, psf: 2200 }, leasehold: { n: 60, psf: 2000 } };
  const [faq] = tenureFaq({ dn: 15, split, generatedAt: '2026-09' });
  assert.equal(faq.name, 'Are freehold condos in District 15 more expensive?');
  assert.match(faq.acceptedAnswer.text, /\$2,200 psf across 40 caveats, against \$2,000 psf across 60 caveats .*10% higher for freehold/);
  assert.match(faq.acceptedAnswer.text, /not a like-for-like premium/);
  const cheaper = tenureFaq({ dn: 9, split: { ...split, freehold: { n: 5, psf: 1800 } }, generatedAt: '2026-09' })[0];
  assert.match(cheaper.acceptedAnswer.text, /10% lower for freehold/);
  assert.deepEqual(tenureFaq({ dn: 15, split: { ...split, shown: false }, generatedAt: '2026-09' }), []);
});

test('district schema: FAQs appended, dateModified on the Dataset, free-to-access boolean', () => {
  const window12 = ['2026-09', '2025-10'];
  const cur = { n: 100, med: 2e6, psf: 2000 };
  const split = { shown: true, freehold: { n: 40, psf: 2200 }, leasehold: { n: 60, psf: 2000 } };
  const [dataset, faq] = buildDistrictSchema({
    d: '15', areaName: 'East Coast', canonical: 'https://joetay.com/condo-prices/d15/', generatedAt: '2026-09',
    window12, cur, yoy: 2.1, projects: PROJECTS, minSales: 3, split, dateModified: '2026-10-30',
  });
  assert.equal(dataset.dateModified, '2026-10-30');
  assert.equal(dataset.isAccessibleForFree, true);
  assert.equal(faq.mainEntity.length, 6);
  const bare = buildDistrictSchema({ d: '15', areaName: 'East Coast', canonical: 'x', generatedAt: '2026-09', window12, cur, yoy: null });
  assert.equal(bare[1].mainEntity.length, 3, 'no project or tenure data, no extra questions');
  assert.equal(bare[0].dateModified, undefined);
});

test('district → HDB town map: every town is evidenced inside the district and has a page', () => {
  assert.equal(Object.keys(POSTAL_SECTORS).length, 28);
  const allSectors = Object.values(POSTAL_SECTORS).flat();
  assert.equal(new Set(allSectors).size, allSectors.length, 'a postal sector belongs to one district');
  for (const [d, towns] of Object.entries(DISTRICT_TOWNS)) {
    assert.ok(DISTRICTS[d], `D${d} is not a postal district`);
    assert.ok(towns.length, `D${d} has an empty list`);
    assert.equal(new Set(towns.map((t) => t.slug)).size, towns.length, `D${d} repeats a town`);
    for (const t of towns) {
      assert.match(t.postal, /^\d{6}$/, `${t.slug}: postal code`);
      assert.ok(POSTAL_SECTORS[d].includes(t.postal.slice(0, 2)), `${t.sample} (${t.postal}) is not in D${d}'s sectors`);
      assert.ok(fs.existsSync(path.join(ROOT, 'hdb-prices', t.slug, 'index.html')), `/hdb-prices/${t.slug}/ does not exist`);
      const h1 = fs.readFileSync(path.join(ROOT, 'hdb-prices', t.slug, 'index.html'), 'utf8').match(/<h1>([^<]+) HDB resale prices<\/h1>/)?.[1];
      assert.equal(h1, t.name, `${t.slug}: name differs from its town page`);
    }
  }
  // the critique's spot checks: D5 is Clementi country, D15 is Marine Parade
  assert.deepEqual(hdbTownsForDistrict('15').map((t) => t.slug), ['marine-parade']);
  assert.ok(hdbTownsForDistrict('05').some((t) => t.slug === 'clementi'));
  assert.ok(!hdbTownsForDistrict('15').some((t) => t.slug === 'bedok'), 'Bedok estates sit in D16, not D15');
  assert.deepEqual(hdbTownsForDistrict('09'), [], 'no guessed town for a district with no evidenced HDB town');
  // the review's spot checks (data.gov.sg town + OneMap postal code)
  assert.deepEqual(hdbTownsForDistrict('07').map((t) => t.slug), ['kallang-whampoa', 'central-area']);
  assert.deepEqual(hdbTownsForDistrict('17').map((t) => t.slug), ['pasir-ris']);
});
