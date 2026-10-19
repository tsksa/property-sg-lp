import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { monthsBack, recentSales, resolveWindows } from '../scripts/lib/estate-windows.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The estate pages headline a "12-month median" and a year-on-year change. The
// generator used to include the current calendar month in the recent window while
// the prior window was a full 12, so the recent window was really 11 months plus a
// part-month and the YoY figure compared mismatched spans. It also labelled that
// partial month "latest full month". The visible symptom was Tampines reporting
// FEWER transactions after a month had passed.

const published = new Set();
for (let year = 2023; year <= 2026; year += 1) {
  for (let month = 1; month <= 12; month += 1) {
    published.add(`${year}-${String(month).padStart(2, '0')}`);
  }
}
const windowsAt = (isoDate, available = published) =>
  resolveWindows(monthsBack(26, new Date(isoDate)), (m) => available.has(m));

test('the current, always-partial calendar month is never the reported month', () => {
  // Mid-month: August data exists but August is not over.
  assert.equal(windowsAt('2026-08-14').latestFullMonth, '2026-07');
  // The cron runs on the 3rd, when the current month is near-empty.
  assert.equal(windowsAt('2026-08-03').latestFullMonth, '2026-07');
});

test('both windows are exactly 12 real months and do not overlap', () => {
  const { window12, prior12 } = windowsAt('2026-08-14');
  assert.equal(window12.length, 12);
  assert.equal(prior12.length, 12);
  assert.deepEqual(window12, [
    '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02',
    '2026-01', '2025-12', '2025-11', '2025-10', '2025-09', '2025-08',
  ]);
  assert.equal(prior12[0], '2025-07');
  assert.equal(prior12[11], '2024-08');
  assert.equal(new Set([...window12, ...prior12]).size, 24, 'windows overlap');
});

test('a publication lag shifts both windows together rather than shortening one', () => {
  const lagging = new Set(published);
  lagging.delete('2026-08');
  lagging.delete('2026-07');

  const { latestFullMonth, window12, prior12 } = windowsAt('2026-08-14', lagging);
  assert.equal(latestFullMonth, '2026-06');
  assert.equal(window12.length, 12);
  assert.equal(prior12.length, 12);
  assert.equal(window12[0], '2026-06');
  assert.equal(prior12[0], '2025-06');
});

test('a year boundary is handled', () => {
  const { latestFullMonth, window12 } = windowsAt('2026-01-03');
  assert.equal(latestFullMonth, '2025-12');
  assert.equal(window12[0], '2025-12');
  assert.equal(window12[11], '2025-01');
});

test('no complete month with data is an error, not silently empty pages', () => {
  assert.throws(() => windowsAt('2026-08-14', new Set(['2026-08'])), /no complete month/);
});

// JOE-448: the "Most recent transactions" table took the first 12 dataset rows
// of the partial current month and the one before. The dataset lists a month
// smallest flat type first, so Bedok's table was all 2-room and 3-room flats
// although 4-room is its most traded type.
const sale = (month, flat_type, block) => ({ month, flat_type, block });
const recentWindow = ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11', '2025-10'];

test('recent sales mix flat types from the newest full month, busiest type first', () => {
  const recs = [
    sale('2026-10', '4 ROOM', 'partial'), // current partial month: never shown
    ...Array.from({ length: 8 }, (_, i) => sale('2026-09', '2 ROOM', `2r${i}`)),
    ...Array.from({ length: 9 }, (_, i) => sale('2026-09', '3 ROOM', `3r${i}`)),
    ...Array.from({ length: 8 }, (_, i) => sale('2026-09', '4 ROOM', `4r${i}`)),
    sale('2026-09', 'EXECUTIVE', 'ex0'),
    // Earlier 4-room sales make it the busiest type over the 12 months.
    ...Array.from({ length: 20 }, (_, i) => sale('2026-03', '4 ROOM', `old${i}`)),
  ];
  const rows = recentSales(recs, recentWindow);
  assert.equal(rows.length, 12);
  assert.ok(rows.every((r) => r.month === '2026-09'), 'an older month was used although the newest had enough sales');
  const types = rows.map((r) => r.flat_type);
  assert.deepEqual([...new Set(types)], ['4 ROOM', '3 ROOM', '2 ROOM', 'EXECUTIVE']);
  // Round robin: 4 types share 12 rows rather than the first type taking them all.
  assert.equal(types.filter((t) => t === '4 ROOM').length, 4);
  assert.equal(types.filter((t) => t === 'EXECUTIVE').length, 1);
  assert.deepEqual(rows.slice(0, 2).map((r) => r.block), ['4r0', '4r1']);
});

test('recent sales reach back a month only when the newest one runs out', () => {
  const recs = [
    sale('2026-09', '4 ROOM', 'a'),
    sale('2026-09', '5 ROOM', 'b'),
    sale('2026-08', '3 ROOM', 'c'),
    sale('2026-08', '4 ROOM', 'd'),
    sale('2025-09', '4 ROOM', 'outside window'),
  ];
  const rows = recentSales(recs, recentWindow, 3);
  assert.deepEqual(rows.map((r) => r.block), ['a', 'b', 'd']);
  assert.deepEqual(recentSales(recs, recentWindow).map((r) => r.block), ['a', 'b', 'd', 'c']);
});

test('a town page table lists only 12-month-window sales and at least three flat types', () => {
  const html = fs.readFileSync(path.join(ROOT, 'hdb-prices', 'bedok', 'index.html'), 'utf8');
  const table = html.split('<h2>Most recent transactions</h2>')[1].split('</table>')[0];
  const latest = html.match(/latest full month (\d{4}-\d{2})/)[1];
  const window12 = monthsBack(13, new Date(`${latest}-15`)).slice(0, 12);
  const rows = [...table.matchAll(/<tr><td>(\d{4}-\d{2})<\/td><td[^>]*>([^·<]+) ·/g)];
  assert.equal(rows.length, 12);
  assert.ok(rows.every(([, month]) => window12.includes(month)), 'a row falls outside the 12-month window');
  assert.ok(new Set(rows.map(([, , type]) => type.trim())).size >= 3, 'the table shows fewer than three flat types');
});
