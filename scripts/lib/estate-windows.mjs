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

/**
 * Rows for a town page's "Most recent transactions" table.
 *
 * JOE-448: the table used to show the first 12 dataset rows of the current
 * (partial) month and the one before. The dataset lists a month's sales by flat
 * type, smallest first, so on /hdb-prices/bedok/ all 12 rows were 2-room and
 * 3-room flats although 4-room is Bedok's most traded type. Now: the newest
 * month in the 12-month window that has sales, taken round-robin across flat
 * types ordered by the town's 12-month volume, so the table shows a mix; an
 * older month is used only when the newest one runs out. Within a month, rows
 * are grouped by that same flat-type order.
 *
 * @param {object[]} recs     the town's records ({ month, flat_type, ... })
 * @param {string[]} window12 newest-first months, from resolveWindows()
 * @param {number} [limit]
 */
export function recentSales(recs, window12, limit = 12) {
  const inWindow = recs.filter((r) => window12.includes(r.month));
  const volume = new Map();
  for (const r of inWindow) volume.set(r.flat_type, (volume.get(r.flat_type) || 0) + 1);
  const order = [...volume.keys()].sort((a, b) => volume.get(b) - volume.get(a) || a.localeCompare(b));
  const rank = (r) => order.indexOf(r.flat_type);

  const picked = [];
  for (const month of window12) {
    if (picked.length >= limit) break;
    const queues = order
      .map((type) => inWindow.filter((r) => r.month === month && r.flat_type === type))
      .filter((queue) => queue.length);
    const fromMonth = [];
    for (let i = 0; picked.length + fromMonth.length < limit && queues.some((queue) => i < queue.length); i += 1) {
      for (const queue of queues) {
        if (i < queue.length && picked.length + fromMonth.length < limit) fromMonth.push(queue[i]);
      }
    }
    picked.push(...fromMonth.sort((a, b) => rank(a) - rank(b)));
  }
  return picked;
}
