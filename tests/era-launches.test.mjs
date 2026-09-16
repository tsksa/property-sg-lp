import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { validateSnapshot } from '../scripts/fetch-era-new-launches.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { summariseProject, facilityHighlights } = require('../netlify/functions/lib/era-launches.js');
const handlerModule = require('../netlify/functions/era-prices.js');

const NOW = new Date('2026-09-16T04:00:00Z');

function eraProject(overrides = {}) {
  return {
    id: 52114376,
    name: 'DUNEARN HOUSE',
    launchDate: '2026-07-25',
    top: '2030-12-30',
    numberOfUnits: '380',
    facilities: '1. Kids Pool\n6. 50m Lap Pool\n29. Tennis Court\n38. Gym\n22. Teppanyaki Pavilion',
    unitSummary: { numberOfUnits: 380, numberOfSoldUnits: 234, numberOfAvailableUnits: 146 },
    unitMix: [
      { unitType: '2 Bedroom', minArea: 527, maxArea: 527, numberOfUnits: 40, numberOfAvailableUnits: 18, minPrice: 1475000, maxPrice: 1646000, minPsf: 2798.9, maxPsf: 3123.3 },
      { unitType: '3 Bedroom', minArea: 872, maxArea: 872, numberOfUnits: 20, numberOfAvailableUnits: 0, minPrice: 2450000, maxPrice: 2600000, minPsf: 2809, maxPsf: 2981 },
    ],
    ...overrides,
  };
}

test('a launched project with consistent counts is published live', () => {
  const summary = summariseProject(eraProject(), { now: NOW });
  assert.equal(summary.live, true, summary.reasons.join('; '));
  assert.deepEqual(summary.totals, { units: 380, sold: 234, available: 146, soldPercent: 61.6 });
  assert.equal(summary.priceRange.min, 1475000);
  assert.equal(summary.mix[0].minPsf, 2799);
  assert.equal(summary.expectedTop, '2030-12-30');
});

test('an unlaunched site never publishes prices, counts or its placeholder TOP date', () => {
  // ERA lists unlaunched GLS sites with placeholder dates (many share 2029-12-30).
  const summary = summariseProject(eraProject({ launchDate: '2027-03-31', top: '2029-12-30' }), { now: NOW });
  assert.equal(summary.live, false);
  assert.ok(summary.reasons.includes('not launched yet'));
  assert.equal(summary.totals, null);
  assert.equal(summary.priceRange, null);
  assert.equal(summary.expectedTop, null);
  assert.ok(summary.mix.every((row) => !('minPrice' in row) && !('available' in row)));
});

test('sold + available that do not add up to the total are withheld', () => {
  const summary = summariseProject(
    eraProject({ unitSummary: { numberOfUnits: 380, numberOfSoldUnits: 100, numberOfAvailableUnits: 146 } }),
    { now: NOW },
  );
  assert.equal(summary.live, false);
  assert.ok(summary.reasons.includes('sold + available does not match total'));
});

test('an implausible psf is withheld rather than shown', () => {
  const mix = eraProject().unitMix.map((row) => ({ ...row, minPsf: 90 }));
  const summary = summariseProject(eraProject({ unitMix: mix }), { now: NOW });
  assert.equal(summary.live, false);
  assert.ok(summary.reasons.includes('psf outside plausible range'));
});

test('facility highlights carry canonical labels, never ERA wording', () => {
  const highlights = facilityHighlights(eraProject().facilities);
  assert.deepEqual(highlights, ["50m lap pool", "Children's pool", 'Tennis court', 'Gym', 'BBQ pavilion']);
  assert.ok(!highlights.includes('Lap pool'), 'generic lap pool is dropped once 50m lap pool matched');
});

test('the committed snapshot holds no prices or availability', () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'era-snapshot.json'), 'utf8'));
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'era-map.json'), 'utf8'));
  assert.deepEqual(validateSnapshot(snapshot, map), []);
  const leaked = JSON.parse(JSON.stringify(snapshot));
  const first = Object.keys(leaked.projects).find((slug) => leaked.projects[slug].unitTypes.length);
  leaked.projects[first].unitTypes[0].minPrice = 1;
  assert.ok(validateSnapshot(leaked, map).some((error) => error.includes('dynamic figures must not be committed')));
});

test('every ERA-mapped project exists in the dataset', () => {
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'era-map.json'), 'utf8'));
  const slugs = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'projects.json'), 'utf8')).projects.map((p) => p.slug));
  for (const slug of Object.keys(map.projects)) assert.ok(slugs.has(slug), `${slug} in era-map.json is not a project`);
});

test('era-prices rejects a malformed slug', async () => {
  const response = await handlerModule.handler({ httpMethod: 'GET', queryStringParameters: { slug: '../etc' } });
  assert.equal(response.statusCode, 400);
});

test('era-prices answers live:false for a project ERA does not list, without calling upstream', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('must not be called'); };
  try {
    const response = await handlerModule.handler({ httpMethod: 'GET', queryStringParameters: { slug: 'rivelle-tampines' } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { slug: 'rivelle-tampines', live: false, reason: 'not listed' });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('era-prices degrades to live:false when ERA is unreachable', async () => {
  const realFetch = globalThis.fetch;
  handlerModule.resetCache();
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  try {
    const response = await handlerModule.handler({ httpMethod: 'GET', queryStringParameters: { slug: 'dunearn-house' } });
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(body.live, false);
    assert.equal(body.reason, 'upstream unavailable');
  } finally {
    globalThis.fetch = realFetch;
    handlerModule.resetCache();
  }
});

test('era-prices serves live figures for a mapped, launched project', async () => {
  const realFetch = globalThis.fetch;
  handlerModule.resetCache();
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [eraProject()] }) });
  try {
    const response = await handlerModule.handler({ httpMethod: 'GET', queryStringParameters: { slug: 'dunearn-house' } });
    const body = JSON.parse(response.body);
    assert.equal(body.live, true);
    assert.equal(body.totals.soldPercent, 61.6);
    assert.match(response.headers['Netlify-CDN-Cache-Control'], /s-maxage=21600/);
    assert.equal(body.source.url, 'https://propertyportal.era.com.sg/new-launches/detail/52114376');
  } finally {
    globalThis.fetch = realFetch;
    handlerModule.resetCache();
  }
});

test('blank availability counts as sold out when the reported types already cover every unsold unit', () => {
  const mix = [
    { unitType: '2 Bedroom', minArea: 624, maxArea: 667, numberOfUnits: 180, numberOfAvailableUnits: null, minPrice: 1486000, maxPrice: 1700000, minPsf: 2340, maxPsf: 2729 },
    { unitType: '4 Bedroom Premium + Study', minArea: 1195, maxArea: 1238, numberOfUnits: 84, numberOfAvailableUnits: 29, minPrice: 2840000, maxPrice: 3100000, minPsf: 2378, maxPsf: 2784 },
  ];
  const sold = summariseProject(eraProject({ unitMix: mix, numberOfUnits: '264', unitSummary: { numberOfUnits: 264, numberOfSoldUnits: 235, numberOfAvailableUnits: 29 } }), { now: NOW });
  assert.equal(sold.live, true, sold.reasons.join('; '));
  assert.equal(sold.mix[0].available, 0);

  // If the reported rows do not account for the total, a blank stays unknown rather than guessed.
  const unknown = summariseProject(eraProject({ unitMix: mix, numberOfUnits: '264', unitSummary: { numberOfUnits: 264, numberOfSoldUnits: 205, numberOfAvailableUnits: 59 } }), { now: NOW });
  assert.equal(unknown.mix[0].available, null);
});
