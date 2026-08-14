import assert from 'node:assert/strict';
import test from 'node:test';

import { monthsBack, resolveWindows } from '../scripts/lib/estate-windows.mjs';

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
