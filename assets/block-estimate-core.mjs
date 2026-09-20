// Pure logic for the "what did flats in your block sell for?" estimate
// (JOE-392). Browser-local, no network, no DOM: assets/block-estimate.js does
// the fetching and rendering, tests/block-estimate.test.mjs pins this file.
//
// The figures describe transactions that already happened. The range is the
// middle half of recent sales of one flat type in the visitor's block (or, when
// the block is too thin, their street). It is labelled indicative everywhere it
// appears and never presented as a valuation.

const SQM_TO_SQFT = 10.7639;

// OneMap returns full road names ("ANG MO KIO AVENUE 3"); the HDB dataset
// stores the abbreviated form ("ANG MO KIO AVE 3"). Same mapping the
// neighbour-prices page has used since launch.
const ROAD_ABBREV = {
  AVENUE: 'AVE', BUKIT: 'BT', CENTRAL: 'CTRL', CLOSE: 'CL', COMMONWEALTH: "C'WEALTH",
  CRESCENT: 'CRES', DRIVE: 'DR', GARDENS: 'GDNS', HEIGHTS: 'HTS', JALAN: 'JLN',
  KAMPONG: 'KG', LORONG: 'LOR', NORTH: 'NTH', PARK: 'PK', PLACE: 'PL', ROAD: 'RD',
  SOUTH: 'STH', STREET: 'ST', TANJONG: 'TG', TERRACE: 'TER', UPPER: 'UPP', SAINT: 'ST.',
};

export function abbrevRoad(road) {
  return String(road).toUpperCase().split(/\s+/).map((tok) => ROAD_ABBREV[tok] || tok).join(' ');
}

export function normalisePostal(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function median(values) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Linear-interpolated quantile, the same definition spreadsheets use (type 7).
export function quantile(values, q) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const roundTo = (value, step) => Math.round(value / step) * step;

export function monthsBetween(month, now) {
  const [y, m] = String(month).split('-').map(Number);
  if (!y || !m) return Infinity;
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
}

export function psf(rec) {
  const price = Number(rec.resale_price);
  const sqm = Number(rec.floor_area_sqm);
  return Number.isFinite(price) && Number.isFinite(sqm) && sqm > 0 ? price / (sqm * SQM_TO_SQFT) : null;
}

const byNewest = (a, b) => String(b.month).localeCompare(String(a.month));

/** Flat types sold in the block (else street), most-traded first. */
export function flatTypesByVolume(records) {
  const counts = new Map();
  for (const r of records) counts.set(r.flat_type, (counts.get(r.flat_type) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([t]) => t);
}

const MIN_FOR_RANGE = 3;

/**
 * Summarise sales for one flat type.
 *
 * Range basis, first that has at least three sales of the type:
 *   block, last 12 months → block, last 24 months → street, last 12 months →
 *   street, last 24 months. Anything thinner shows the sales but no range.
 * Change: street median (block included) for the last 12 months against the
 * 12 before, only when each window has at least five sales.
 */
export function summarise({ blockRecords, streetRecords, flatType, now = new Date() }) {
  const block = blockRecords.filter((r) => r.flat_type === flatType);
  const street = streetRecords.filter((r) => r.flat_type === flatType);
  const within = (recs, months) => recs.filter((r) => monthsBetween(r.month, now) <= months);
  const bases = [
    { scope: 'block', months: 12, recs: within(block, 12) },
    { scope: 'block', months: 24, recs: within(block, 24) },
    { scope: 'street', months: 12, recs: within(street, 12) },
    { scope: 'street', months: 24, recs: within(street, 24) },
  ];
  const basis = bases.find((b) => b.recs.length >= MIN_FOR_RANGE) || null;
  const prices = basis ? basis.recs.map((r) => Number(r.resale_price)) : [];
  const range = basis
    ? {
        low: roundTo(basis.recs.length >= 4 ? quantile(prices, 0.25) : Math.min(...prices), 1000),
        high: roundTo(basis.recs.length >= 4 ? quantile(prices, 0.75) : Math.max(...prices), 1000),
        median: roundTo(median(prices), 1000),
        psf: Math.round(median(basis.recs.map(psf))),
        count: basis.recs.length,
        scope: basis.scope,
        months: basis.months,
      }
    : null;

  const recent12 = street.filter((r) => monthsBetween(r.month, now) <= 12).map((r) => Number(r.resale_price));
  const prior12 = street
    .filter((r) => { const m = monthsBetween(r.month, now); return m > 12 && m <= 24; })
    .map((r) => Number(r.resale_price));
  const change = recent12.length >= 5 && prior12.length >= 5
    ? Math.round((median(recent12) / median(prior12) - 1) * 1000) / 10
    : null;

  const pool = block.length ? block : street;
  return {
    flatType,
    range,
    change,
    latest: [...pool].sort(byNewest)[0] || null,
    recent: [...pool].sort(byNewest).slice(0, 5),
    blockCount: block.length,
    streetCount: street.length,
  };
}

// Selling costs a seller actually meets, from the site's own "selling after MOP"
// guide: commission 2% + 9% GST, legal fees about $1,800 to $2,500, HDB resale
// administrative fee about $80.
export const PROCEEDS_DEFAULTS = Object.freeze({ commissionRate: 2, gstRate: 9, legalFees: 2500, hdbFee: 80 });

export function netProceeds({ salePrice, outstandingLoan = 0, cpfRefund = 0, commissionRate = PROCEEDS_DEFAULTS.commissionRate, gstRate = PROCEEDS_DEFAULTS.gstRate, legalFees = PROCEEDS_DEFAULTS.legalFees, hdbFee = PROCEEDS_DEFAULTS.hdbFee }) {
  for (const [label, v] of Object.entries({ salePrice, outstandingLoan, cpfRefund, commissionRate, gstRate, legalFees, hdbFee })) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new RangeError(`${label} must be zero or more`);
  }
  if (commissionRate > 10 || gstRate > 20) throw new RangeError('rate out of range');
  const commission = Math.round(salePrice * (commissionRate / 100) * (1 + gstRate / 100));
  const deductions = outstandingLoan + cpfRefund + commission + legalFees + hdbFee;
  return { commission, deductions, cash: salePrice - deductions };
}

/** A label for where the range came from, written for the visitor. */
export function basisLabel(range, road) {
  if (!range) return '';
  const where = range.scope === 'block' ? 'in your block' : `along ${road}`;
  const spread = range.count >= 4 ? 'Middle half of' : 'Lowest to highest of';
  return `${spread} ${range.count} sales ${where} in the last ${range.months} months.`;
}
