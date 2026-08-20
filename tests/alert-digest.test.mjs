import assert from 'node:assert/strict';
import test from 'node:test';

import { digestCandidateMonths } from '../netlify/functions/alert-digest.js';

// The price-alert digest used to pick "the latest month with any records" by
// literally fetching the current calendar month first and only moving back if
// it came back empty. data.gov.sg's HDB resale dataset adds records for the
// in-progress month incrementally — it does not wait for month-end — so a
// digest run partway through the month could see a handful of early records
// for the CURRENT month, treat that partial month as final, and permanently
// stamp it into `_digested`. Every transaction added to that month afterward
// (most of it — the month wasn't over) would never be checked again by a
// later run, silently dropping the alert for that subscriber. This mirrors
// the exact bug already found and fixed for the estate pages — see
// tests/estate-windows.test.mjs and scripts/lib/estate-windows.mjs.

test('the current calendar month is never a candidate, regardless of the day of month', () => {
  // Mid-month.
  assert.deepEqual(digestCandidateMonths(new Date('2026-08-14')), ['2026-07', '2026-06', '2026-05']);
  // The cron fires on the 6th — the current month is only days old and would
  // have the fewest real records of the three, making it the most likely to
  // be mistaken for "the latest complete month" under the old logic.
  assert.deepEqual(digestCandidateMonths(new Date('2026-08-06')), ['2026-07', '2026-06', '2026-05']);
  // Last day of the month — the reproduction case for the original bug: the
  // month is nearly complete and very likely already has some records, which
  // is exactly when the old "first month with any records wins" loop would
  // have picked it instead of the true latest complete month, 2026-07.
  assert.deepEqual(digestCandidateMonths(new Date('2026-08-31')), ['2026-07', '2026-06', '2026-05']);
});

test('a year boundary is handled', () => {
  assert.deepEqual(digestCandidateMonths(new Date('2026-01-15')), ['2025-12', '2025-11', '2025-10']);
});

test('the lookback window is configurable and still excludes the current month', () => {
  assert.deepEqual(digestCandidateMonths(new Date('2026-08-14'), 1), ['2026-07']);
  assert.deepEqual(
    digestCandidateMonths(new Date('2026-08-14'), 5),
    ['2026-07', '2026-06', '2026-05', '2026-04', '2026-03'],
  );
});
