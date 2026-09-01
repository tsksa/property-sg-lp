import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isCondoResale, toYearMonth, windowStats, median, psf, bandFor, SQM_TO_SQFT,
} from '../scripts/lib/condo-stats.mjs';
import { DISTRICTS } from '../scripts/lib/condo-districts.mjs';

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
