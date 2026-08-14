// Month-window arithmetic for the estate price pages.
//
// Extracted from generate-estate-pages.mjs so it can be tested without hitting
// data.gov.sg. The generator computes a "last 12 months" window and a prior
// 12-month window for the year-on-year figure; both must be exactly 12 real
// months or the comparison is meaningless.

/** Calendar months, newest first, starting from the month containing `from`. */
export function monthsBack(count, from = new Date()) {
  const out = [];
  const d = new Date(from);
  d.setDate(1);
  for (let i = 0; i < count; i += 1) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

/**
 * Resolve the reporting windows.
 *
 * `months[0]` is the current calendar month and is never complete, so it is
 * always discarded. Both windows are anchored to the newest month that actually
 * has data, so a publication lag shifts them together rather than silently
 * shortening the recent window.
 *
 * @param {string[]} months  newest-first month keys, from monthsBack()
 * @param {(month: string) => boolean} hasData
 */
export function resolveWindows(months, hasData) {
  const completeMonths = months.slice(1);
  const latestFullMonth = completeMonths.find(hasData);
  if (!latestFullMonth) throw new Error('no complete month has any records — aborting');

  const anchor = months.indexOf(latestFullMonth);
  const window12 = months.slice(anchor, anchor + 12);
  const prior12 = months.slice(anchor + 12, anchor + 24);

  if (window12.length !== 12 || prior12.length !== 12) {
    throw new Error(
      `window math is short (recent=${window12.length}, prior=${prior12.length}) — raise MONTHS_FETCHED`,
    );
  }
  return { latestFullMonth, window12, prior12 };
}
