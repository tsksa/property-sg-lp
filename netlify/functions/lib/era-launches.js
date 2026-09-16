// Shared, side-effect-free logic for reading ERA's public new-launch search.
//
// Used by two callers that must agree exactly:
//   - netlify/functions/era-prices.js     live prices / availability for a page
//   - scripts/fetch-era-new-launches.mjs  the committed static snapshot
//
// ERA is treated as corroboration, not truth. Measured 2026-09-16 against
// EdgeProp and developer filings, its listing data had real errors: Pinery
// Residences in D16 (it is D18), Keppel Bay Plot 6 as freehold (99-year),
// Thomson Reserve at 1,240 units (1,268), and launch/TOP dates on unlaunched
// sites that are placeholders (clusters of 2027-03-31 and 2029-12-30). So
// nothing here overwrites projects.json facts, and dynamic figures are only
// released when they pass the plausibility checks below.

const ERA_ORIGIN = 'https://propertyportal.era.com.sg';
const ERA_SEARCH_URL = `${ERA_ORIGIN}/api/salesplus/new-launches/search`;

function searchBody({ page = 1, pageSize = 200 } = {}) {
  return {
    bedroomTypes: null,
    completionDateRange: null,
    launchDateRange: null,
    completionStatus: null,
    countries: ['SG'],
    cursor: null,
    districts: null,
    keyword: '',
    minArea: null,
    maxArea: null,
    minPrice: null,
    maxPrice: null,
    nearbyMRTStations: null,
    nearbySchools: null,
    tenureCategories: null,
    propertyTypes: null,
    isFeatured: null,
    marketSegments: null,
    isSoldOut: null,
    page,
    pageSize,
    sortBy: 'launchDate',
    sortOrder: 'desc',
    quarter: null,
    year: null,
    hidePropertyTypes: ['HDB'],
  };
}

const eraDetailUrl = (id) => `${ERA_ORIGIN}/new-launches/detail/${encodeURIComponent(String(id))}`;

// Number(null) and Number('') are 0, which would turn "ERA left this blank" into
// "zero units available". Missing must stay missing.
const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const isoDate = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

// Canonical facility names matched against ERA's free-text facilities list.
// Only the fact that a facility exists is carried over — never ERA's wording.
const FACILITY_PATTERNS = [
  ['50m lap pool', /50\s*m(?:etre)?\s*lap\s*pool/i],
  ['Lap pool', /lap\s*pool/i],
  ['Leisure pool', /(leisure|main|family)\s*pool/i],
  ["Children's pool", /(kids?|children'?s?|wading)\s*pool/i],
  ['Jacuzzi / spa pool', /jacuzzi|spa\s*(pool|bed|seat)|hydro/i],
  ['Tennis court', /tennis/i],
  ['Pickleball court', /pickleball/i],
  ['Gym', /\bgym|fitness\s*(centre|center|studio|corner)/i],
  ['Outdoor fitness', /outdoor\s*(fitness|gym)/i],
  ['Clubhouse', /club\s*house|clubhouse|\bclub\b/i],
  ['Function room', /function\s*room|party\s*room|banquet/i],
  ['BBQ pavilion', /bbq|barbecue|teppanyaki|grill/i],
  ["Children's playground", /play\s*(ground|garden|area|zone|forest)/i],
  ['Sky garden / sky terrace', /sky\s*(garden|terrace|deck|lounge)/i],
  ['Steam room / sauna', /steam\s*room|sauna/i],
  ['Co-working / meeting pods', /co-?working|meeting\s*(room|pod)|study\s*(room|lounge)/i],
  ['Yoga / wellness lawn', /yoga|wellness|meditation/i],
  ['Dog run / pet area', /dog\s*run|pet\s*(park|area|garden)/i],
  ['Jogging track', /jogging|running\s*track|fitness\s*trail/i],
  ['EV charging', /\bev\b|electric\s*vehicle|charging/i],
];

function facilityHighlights(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const found = [];
  for (const [label, pattern] of FACILITY_PATTERNS) {
    if (!pattern.test(text)) continue;
    // "Lap pool" is redundant once "50m lap pool" matched; same for a generic clubhouse.
    if (label === 'Lap pool' && found.includes('50m lap pool')) continue;
    found.push(label);
  }
  return found.slice(0, 12);
}

/**
 * Reduce one ERA search result to what joetay.com may show, and decide whether
 * its dynamic figures (prices, psf, availability, % sold) are trustworthy
 * enough to publish.
 */
function summariseProject(era, { now = new Date() } = {}) {
  const summary = era.unitSummary || {};
  const today = now.toISOString().slice(0, 10);
  const launchDate = isoDate(era.launchDate);
  const mix = (Array.isArray(era.unitMix) ? era.unitMix : [])
    .map((row) => ({
      type: String(row.unitType || '').trim(),
      minArea: num(row.minArea),
      maxArea: num(row.maxArea),
      units: num(row.numberOfUnits),
      available: num(row.numberOfAvailableUnits),
      minPrice: num(row.minPrice),
      maxPrice: num(row.maxPrice),
      minPsf: num(row.minPsf),
      maxPsf: num(row.maxPsf),
    }))
    .filter((row) => row.type);

  const units = num(summary.numberOfUnits) ?? num(era.numberOfUnits);
  const available = num(summary.numberOfAvailableUnits);
  const sold = num(summary.numberOfSoldUnits);

  const reasons = [];
  if (!launchDate || launchDate > today) reasons.push('not launched yet');
  if (!mix.length) reasons.push('no unit mix');
  if (!mix.some((row) => row.minPrice > 0)) reasons.push('no prices');
  if (!(units > 0)) reasons.push('no unit total');
  if (available == null || sold == null) reasons.push('no sales counts');
  if (units > 0 && available != null && sold != null) {
    if (available > units || sold > units) reasons.push('counts exceed total');
    // ERA reports sold and available separately; they should account for the total.
    if (Math.abs(sold + available - units) > Math.max(2, units * 0.02)) reasons.push('sold + available does not match total');
  }
  if (mix.some((row) => row.minPrice > 0 && row.maxPrice > 0 && row.minPrice > row.maxPrice)) reasons.push('price range inverted');
  if (mix.some((row) => row.minPsf != null && (row.minPsf < 500 || row.minPsf > 10000))) reasons.push('psf outside plausible range');

  const priced = mix.filter((row) => row.minPrice > 0);
  const live = reasons.length === 0;

  // ERA leaves a unit type's availability blank once it has sold out. When the
  // types that do report availability already account for every unsold unit,
  // the blank ones are sold out — otherwise a sold-out type would still show its
  // launch "from" price as if it could be bought (Pinery Residences, 2026-09-16:
  // 3 + 29 + 4 reported = 36 available, the other seven types blank).
  if (live) {
    const reported = mix.filter((row) => row.available != null).reduce((sum, row) => sum + row.available, 0);
    if (reported === available) for (const row of mix) if (row.available == null) row.available = 0;
  }

  return {
    eraId: String(era.id),
    detailUrl: eraDetailUrl(era.id),
    launchDate,
    expectedTop: live ? isoDate(era.top) : null,
    live,
    reasons,
    totals: live ? { units, sold, available, soldPercent: Math.round((sold / units) * 1000) / 10 } : null,
    priceRange: live ? { min: Math.min(...priced.map((r) => r.minPrice)), max: Math.max(...priced.map((r) => r.maxPrice || r.minPrice)) } : null,
    psfRange: live
      ? {
          min: Math.round(Math.min(...priced.map((r) => r.minPsf).filter((v) => v > 0))),
          max: Math.round(Math.max(...priced.map((r) => r.maxPsf || r.minPsf).filter((v) => v > 0))),
        }
      : null,
    mix: mix.map((row) => ({
      type: row.type,
      minArea: row.minArea,
      maxArea: row.maxArea,
      units: row.units,
      ...(live
        ? {
            available: row.available,
            minPrice: row.minPrice > 0 ? row.minPrice : null,
            maxPrice: row.maxPrice > 0 ? row.maxPrice : null,
            minPsf: row.minPsf > 0 ? Math.round(row.minPsf) : null,
            maxPsf: row.maxPsf > 0 ? Math.round(row.maxPsf) : null,
          }
        : {}),
    })),
    facilities: facilityHighlights(era.facilities),
  };
}

async function fetchEraProjects({ fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ERA_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(searchBody()),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ERA search returned HTTP ${response.status}`);
    const body = await response.json();
    if (!body || !Array.isArray(body.data)) throw new Error('ERA search returned an unexpected shape');
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  ERA_ORIGIN,
  ERA_SEARCH_URL,
  searchBody,
  eraDetailUrl,
  facilityHighlights,
  summariseProject,
  fetchEraProjects,
};
