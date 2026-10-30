// Pure statistics helpers for the /condo-prices/ district pages, extracted so
// tests can exercise the filtering and money math without touching the URA API.
//
// Source records are URA PMI_Resi_Transaction rows: price (SGD), area (sqm),
// contractDate (MMYY), district ('01'..'28'), propertyType, typeOfSale
// ('1' new sale, '2' sub sale, '3' resale), noOfUnits.

export const SQM_TO_SQFT = 10.7639;

/** URA contractDate 'MMYY' → 'YYYY-MM' (dataset spans ~5 years, all 20xx). */
export function toYearMonth(mmyy) {
  if (!/^\d{4}$/.test(mmyy ?? '')) return null;
  return `20${mmyy.slice(2)}-${mmyy.slice(0, 2)}`;
}

/**
 * The page's population: private condominiums and apartments, RESALE only,
 * single-unit deals. New sales belong to the new-launches cluster; sub sales
 * are a sliver (<4%) with different dynamics; ECs are HDB-adjacent and landed
 * is not "condo prices"; bulk/collective rows (noOfUnits > 1) would let one
 * en-bloc deal move a district median.
 */
export function isCondoResale(tx) {
  return (
    (tx.propertyType === 'Condominium' || tx.propertyType === 'Apartment') &&
    tx.typeOfSale === '3' &&
    Number(tx.noOfUnits) === 1 &&
    Number(tx.price) > 0 &&
    Number(tx.area) > 0
  );
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function psf(tx) {
  return Number(tx.price) / (Number(tx.area) * SQM_TO_SQFT);
}

/** Stats over the rows whose contract month falls in `monthsSet`. */
export function windowStats(rows, monthsSet) {
  const inWin = rows.filter((r) => monthsSet.includes(toYearMonth(r.contractDate)));
  return {
    n: inWin.length,
    med: median(inWin.map((r) => Number(r.price))),
    psf: median(inWin.map(psf)),
    inWin,
  };
}

/** Size bands in sqft — a proxy for bedroom count that the data actually has. */
export const SIZE_BANDS = [
  { label: 'Up to 700 sqft', upToSqft: 700 },
  { label: '701–1,000 sqft', upToSqft: 1000 },
  { label: '1,001–1,400 sqft', upToSqft: 1400 },
  { label: 'Above 1,400 sqft', upToSqft: Infinity },
];

export function bandFor(tx) {
  const sqft = Number(tx.area) * SQM_TO_SQFT;
  return SIZE_BANDS.find((b) => sqft <= b.upToSqft);
}

// ── District page: per-project table, tenure split, meta description ──

/**
 * Tenure as a compact label from URA's verbatim field: "Freehold",
 * "99 yrs lease commencing from 2012" -> "99 yrs from 2012". Anything else is
 * shown as URA wrote it.
 */
export function tenureLabel(tenure) {
  const s = String(tenure ?? '').trim();
  if (!s) return '—';
  if (/^freehold$/i.test(s)) return 'Freehold';
  const m = s.match(/^(\d+)\s*yrs?\s+lease\s+commencing\s+from\s+(\d{4})$/i);
  return m ? `${m[1]} yrs from ${m[2]}` : s;
}

/**
 * Freehold (999- and 9999-year leases counted with it, as the trend line's
 * tenureBand does) vs 99-year leasehold. Any other lease length is 'other' and
 * sits in neither side.
 */
export function tenureKind(tenure) {
  const s = String(tenure ?? '');
  if (/freehold|^\s*9{3,4}\s*yrs?/i.test(s)) return 'freehold';
  if (/^\s*99\s*yrs?/i.test(s)) return 'leasehold';
  return s.trim() ? 'other' : null;
}

/** Fewer caveats in a district → a lower bar for a project to get a row. */
export function minProjectSales(districtN) {
  return districtN < 150 ? 2 : 3;
}

/** 'Thomson Reserve' -> 'p-thomson-reserve' (row anchors on the district page). */
export function projectAnchor(name) {
  const slug = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `p-${slug || 'project'}`;
}

const mostCommon = (values) => {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0];
};

/**
 * One row per project from the window's sales: URA project name verbatim,
 * street (the project's most common, as URA can record one project under
 * more than one street), tenure (the project's most common tenure), sales, median $psf,
 * median price and the latest contract month. Projects under `minSales` are
 * dropped. Sorted by sales, then $psf, then name; anchors are unique.
 */
export function projectRows(inWin, minSales) {
  const groups = new Map();
  for (const r of inWin) {
    const key = r.project;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const recs of groups.values()) {
    if (recs.length < minSales) continue;
    const months = recs.map((r) => toYearMonth(r.contractDate)).filter(Boolean).sort();
    out.push({
      project: recs[0].project,
      street: mostCommon(recs.map((r) => r.street ?? '')) ?? '',
      tenure: tenureLabel(mostCommon(recs.map((r) => r.tenure ?? ''))),
      n: recs.length,
      psf: median(recs.map(psf)),
      med: median(recs.map((r) => Number(r.price))),
      latest: months[months.length - 1] ?? null,
    });
  }
  out.sort((a, b) => b.n - a.n || b.psf - a.psf || a.project.localeCompare(b.project));
  const used = new Set();
  for (const row of out) {
    let id = projectAnchor(row.project);
    for (let i = 2; used.has(id); i++) id = `${projectAnchor(row.project)}-${i}`;
    used.add(id);
    row.id = id;
  }
  return out;
}

/**
 * Freehold vs 99-year medians over the window. `shown` only when each side
 * has at least `minEach` sales; below that the comparison would mislead.
 */
export function tenureSplit(inWin, minEach = 5) {
  const side = (kind) => {
    const recs = inWin.filter((r) => tenureKind(r.tenure) === kind);
    return { n: recs.length, psf: median(recs.map(psf)), med: median(recs.map((r) => Number(r.price))) };
  };
  const freehold = side('freehold');
  const leasehold = side('leasehold');
  return { freehold, leasehold, shown: freehold.n >= minEach && leasehold.n >= minEach };
}

/** Cut to `max` characters on a word boundary and end on a full stop. */
export function trimSentence(text, max = 160) {
  let s = String(text).trim();
  if (s.length > max || (!s.endsWith('.') && s.length > max - 1)) {
    s = s.slice(0, max - 1);
    const cut = s.lastIndexOf(' ');
    if (cut > 0) s = s.slice(0, cut);
  }
  s = s.replace(/[\s,;:—–-]+$/, '');
  return s.endsWith('.') ? s : `${s}.`;
}

/**
 * Meta description, figures first. Plain text (escape after): the 160-char
 * budget applies to what the reader sees. Drops the closing sentence, then the
 * area name, before falling back to a word-boundary trim. `hasProjects` is
 * whether the page renders the by-project table; without it the tail does not
 * promise one.
 */
export function districtDescription({ dn, area, med, psf: psfValue, n, hasProjects = true }) {
  const figures = `12-month median $${Math.round(med).toLocaleString('en-SG')}, $${Math.round(psfValue).toLocaleString('en-SG')} psf across ${n.toLocaleString('en-SG')} URA caveats.`;
  const tail = hasProjects ? ' By size and project; updated monthly.' : ' By size; updated monthly.';
  const candidates = [
    `District ${dn} (${area}) condo resale prices: ${figures}${tail}`,
    `District ${dn} (${area}) condo resale prices: ${figures}`,
    `District ${dn} condo resale prices: ${figures}${tail}`,
    `District ${dn} condo resale prices: ${figures}`,
  ];
  return candidates.find((c) => c.length <= 160) ?? trimSentence(candidates[3]);
}

const LAUNCH_STATUS = { selling: 'Selling now', upcoming: 'Upcoming', 'sold-out': 'Sold out' };

/**
 * Plain-text detail for one "New launches in District N" entry, from the
 * launch catalogue row: location, an EC tag (EC buyers face eligibility rules),
 * and the catalogue status dated by its verifiedAt, since the condo pages
 * regenerate on their own schedule. No date, no status.
 */
export function launchDetail(p) {
  const parts = [p.location];
  if (p.propertyType === 'executive-condominium') parts.push('EC');
  const status = LAUNCH_STATUS[p.status];
  if (status && /^\d{4}-\d{2}-\d{2}$/.test(p.verifiedAt ?? '')) parts.push(`${status} (as of ${dateLabel(p.verifiedAt)})`);
  return parts.filter(Boolean).join(' · ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-09' -> 'Sep 2026'. */
export function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(ym);
}

/** '2026-10-30' -> '30 Oct 2026'. */
export function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso);
}
