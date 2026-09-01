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
