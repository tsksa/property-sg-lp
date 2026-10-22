import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { summariseProject } = require('../netlify/functions/lib/era-launches.js');
const script = fs.readFileSync(new URL('../new-launches/project-live.js', import.meta.url), 'utf8');

function node(text = '') {
  return {
    textContent: text, hidden: false, style: {}, children: [],
    classList: { values: new Set(), add(value) { this.values.add(value); } },
    appendChild(child) { this.children.push(child); this.textContent += child.textContent; },
  };
}
function setup(fetchImpl) {
  const rows = new Map(['Sold out', 'Available', 'Unknown', 'Awaiting price'].map((type) => {
    const row = node();
    row.cells = Object.fromEntries(['price', 'psf', 'available'].map((key) => [key, node('—')]));
    row.getAttribute = () => type;
    row.querySelector = (selector) => row.cells[selector.match(/data-live="([^"]+)"/)[1]];
    return [type, row];
  }));
  const totals = Object.fromEntries(['soldPercent', 'available', 'from', 'psf'].map((key) => [key, node('—')]));
  const summary = node(); summary.hidden = true;
  const status = node("Live prices load here; ask Joe for today's price list.");
  const bar = node(); const section = node();
  section.getAttribute = () => 'pinery-residences';
  section.querySelectorAll = () => [...rows.values()];
  section.querySelector = (selector) => {
    const total = selector.match(/data-live-total="([^"]+)"/);
    return total ? totals[total[1]] : ({ '[data-live-summary]': summary, '[data-live-status]': status, '[data-live-bar]': bar })[selector];
  };
  const requests = [];
  const fetch = (...args) => { requests.push(args); return fetchImpl(...args); };
  vm.runInNewContext(script, {
    window: { fetch }, fetch, Intl, Date,
    document: { title: 'Pinery Residences', querySelector: () => section, createElement: () => node(), createTextNode: node },
  });
  return { rows, totals, summary, status, bar, section, requests };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
function liveData({ available = 35, mix } = {}) {
  const summary = summariseProject({
    id: 123, launchDate: '2026-01-01',
    unitSummary: { numberOfUnits: 588, numberOfSoldUnits: 588 - available, numberOfAvailableUnits: available },
    unitMix: mix || [
      { unitType: 'Sold out', numberOfAvailableUnits: null, minPrice: 1486000, minPsf: 2340 },
      { unitType: 'Available', numberOfAvailableUnits: 35, minPrice: 2842000, maxPrice: 3100000, minPsf: 2378, maxPsf: 2784 },
    ],
  }, { now: new Date('2026-10-22T12:00:00Z') });
  return { ...summary, source: { url: summary.detailUrl }, fetchedAt: '2026-10-22T12:00:00Z' };
}
const response = (data) => ({ ok: true, json: async () => data });

test('delayed live prices leave static fallback intact, then show only available prices', async () => {
  let resolve;
  const ui = setup(() => new Promise((done) => { resolve = done; }));
  assert.equal(ui.summary.hidden, true);
  assert.equal(ui.totals.from.textContent, '—');
  assert.match(ui.status.textContent, /ask Joe/);
  resolve(response(liveData()));
  await settle();
  assert.equal(ui.summary.hidden, false);
  assert.equal(ui.totals.from.textContent, '$2.842m');
  assert.equal(ui.totals.psf.textContent, '$2,378–2,784');
  assert.equal(ui.totals.available.textContent, '35 of 588');
  assert.equal(ui.rows.get('Sold out').cells.price.textContent, 'Sold out');
  assert.equal(ui.rows.get('Available').cells.price.textContent, '$2.842m');
  assert.match(ui.status.textContent, /22 Oct 2026/);
  assert.equal(ui.requests.length, 1);
});

test('unknown row availability never displays its launch price as purchasable stock', async () => {
  const ui = setup(async () => response(liveData({ mix: [
    { unitType: 'Unknown', numberOfAvailableUnits: null, minPrice: 1486000, minPsf: 2340 },
    { unitType: 'Available', numberOfAvailableUnits: 20, minPrice: 2842000, minPsf: 2378 },
  ] })));
  await settle();
  assert.equal(ui.rows.get('Unknown').cells.price.textContent, 'Confirm');
  assert.equal(ui.rows.get('Unknown').cells.available.textContent, 'Unconfirmed');
  assert.equal(ui.rows.get('Unknown').cells.psf.textContent, '—');
  assert.equal(ui.rows.get('Unknown').classList.values.has('is-sold-out'), false);
  assert.equal(ui.totals.from.textContent, '$2.842m');
});

test('unknown or unpriced available inventory shows a confirmation state rather than a minimum', async () => {
  for (const mix of [
    [{ unitType: 'Unknown', numberOfAvailableUnits: null, minPrice: 1486000, minPsf: 2340 }],
    [{ unitType: 'Sold out', numberOfAvailableUnits: 0, minPrice: 1486000, minPsf: 2340 },
      { unitType: 'Awaiting price', numberOfAvailableUnits: 35, minPrice: null, minPsf: null }],
  ]) {
    const ui = setup(async () => response(liveData({ mix })));
    await settle();
    assert.equal(ui.totals.from.textContent, 'Confirm price');
    assert.equal(ui.totals.psf.textContent, '—');
    assert.match(ui.status.textContent, /starting price for confirmed available units is not listed/);
  }
});

test('a fully sold-out response does not advertise its historical starting price', async () => {
  const ui = setup(async () => response(liveData({ available: 0, mix: [
    { unitType: 'Sold out', numberOfAvailableUnits: null, minPrice: 1486000, minPsf: 2340 },
  ] })));
  await settle();
  assert.equal(ui.totals.from.textContent, 'Sold out');
  assert.equal(ui.totals.psf.textContent, '—');
  assert.match(ui.status.textContent, /No units are listed as available/);
});

test('HTTP, network, malformed and non-live responses preserve the static fallback', async () => {
  for (const fetchImpl of [
    async () => ({ ok: false }),
    async () => { throw new Error('offline'); },
    async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } }),
    async () => response({ live: false }),
    async () => response({ live: true, totals: {}, mix: [] }),
  ]) {
    const ui = setup(fetchImpl);
    await settle();
    assert.equal(ui.summary.hidden, true);
    assert.equal(ui.totals.from.textContent, '—');
    assert.equal(ui.rows.get('Available').cells.price.textContent, '—');
    assert.equal(ui.section.classList.values.has('is-live'), false);
    assert.match(ui.status.textContent, /ask Joe/);
  }
});
