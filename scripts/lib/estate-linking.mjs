// Shared internal-linking data + renderers for the /hdb-prices/ estate pages.
//
// Used by both generate-estate-pages.mjs (fresh generation from data.gov.sg)
// and scripts/patch-estate-linking.mjs (a one-off pass that applies the same
// markup to already-generated files when a full regenerate isn't possible,
// e.g. no network access to data.gov.sg). Keeping the markup in one module
// means both paths render byte-identical blocks.
//
// JOE-289 cycle 2: the 26 town pages had exactly one inbound link each (from
// the hub) and zero outbound links to each other, to new-launch projects, or
// to any other tool/content page on the site — the site's highest-demand
// keyword cluster was carrying almost no internal PageRank.

// Adjacency is approximate real-world Singapore town geography (used only to
// pick genuinely nearby towns for internal links, not for any data claim).
export const NEARBY_TOWNS = {
  'ang-mo-kio': ['bishan', 'serangoon', 'yishun', 'hougang', 'toa-payoh'],
  'bedok': ['tampines', 'marine-parade', 'pasir-ris', 'geylang'],
  'bishan': ['ang-mo-kio', 'toa-payoh', 'serangoon', 'hougang'],
  'bukit-batok': ['choa-chu-kang', 'jurong-east', 'bukit-panjang', 'clementi'],
  'bukit-merah': ['queenstown', 'central-area', 'clementi', 'geylang'],
  'bukit-panjang': ['choa-chu-kang', 'bukit-batok', 'bukit-timah', 'woodlands'],
  'bukit-timah': ['bukit-panjang', 'clementi', 'queenstown', 'bishan'],
  'central-area': ['bukit-merah', 'kallang-whampoa', 'geylang', 'queenstown'],
  'choa-chu-kang': ['bukit-panjang', 'bukit-batok', 'jurong-west', 'woodlands'],
  'clementi': ['queenstown', 'jurong-east', 'bukit-timah', 'bukit-merah'],
  'geylang': ['kallang-whampoa', 'marine-parade', 'central-area', 'toa-payoh'],
  'hougang': ['serangoon', 'sengkang', 'punggol', 'ang-mo-kio'],
  'jurong-east': ['jurong-west', 'clementi', 'bukit-batok'],
  'jurong-west': ['jurong-east', 'choa-chu-kang', 'bukit-batok'],
  'kallang-whampoa': ['central-area', 'toa-payoh', 'geylang', 'serangoon'],
  'marine-parade': ['geylang', 'bedok', 'central-area'],
  'pasir-ris': ['tampines', 'punggol', 'sengkang', 'bedok'],
  'punggol': ['sengkang', 'hougang', 'pasir-ris', 'serangoon'],
  'queenstown': ['bukit-merah', 'clementi', 'central-area', 'bukit-timah'],
  'sembawang': ['yishun', 'woodlands', 'ang-mo-kio', 'sengkang'],
  'sengkang': ['punggol', 'hougang', 'serangoon', 'pasir-ris'],
  'serangoon': ['hougang', 'ang-mo-kio', 'bishan', 'sengkang'],
  'tampines': ['bedok', 'pasir-ris', 'sengkang', 'hougang'],
  'toa-payoh': ['bishan', 'ang-mo-kio', 'kallang-whampoa', 'central-area'],
  'woodlands': ['sembawang', 'choa-chu-kang', 'yishun', 'bukit-panjang'],
  'yishun': ['sembawang', 'ang-mo-kio', 'woodlands', 'hougang'],
};

// Town -> the URA postal district its HDB estate mostly sits in. Used only to
// surface plausibly-relevant new-launch projects, not as a legal boundary.
export const TOWN_DISTRICT = {
  'ang-mo-kio': 'D20',
  'bedok': 'D16',
  'bishan': 'D20',
  'bukit-batok': 'D23',
  'bukit-merah': 'D03',
  'bukit-panjang': 'D23',
  'bukit-timah': 'D21',
  'central-area': 'D01',
  'choa-chu-kang': 'D23',
  'clementi': 'D05',
  'geylang': 'D14',
  'hougang': 'D19',
  'jurong-east': 'D22',
  'jurong-west': 'D22',
  'kallang-whampoa': 'D12',
  'marine-parade': 'D15',
  'pasir-ris': 'D18',
  'punggol': 'D19',
  'queenstown': 'D03',
  'sembawang': 'D27',
  'sengkang': 'D19',
  'serangoon': 'D19',
  'tampines': 'D18',
  'toa-payoh': 'D12',
  'woodlands': 'D25',
  'yishun': 'D27',
};

// Districts with no HDB town page of their own — mostly the private-housing-heavy
// central districts, plus D24 (Tengah: too new for enough resale history to have
// earned a page yet) — still have active launches worth surfacing. Each maps to
// the one existing town page that's geographically closest or administratively
// overlapping, so a launch there isn't orphaned from the /hdb-prices/ cluster,
// the site's strongest internal-link-equity source. Same non-legal, non-market-
// data caveat as NEARBY_TOWNS above: this is a proximity heuristic, not a claim.
//
// JOE-289 cycle: found via an internal-link audit that 10 of 26 active
// (selling/upcoming) new-launch pages — D02, D04, D08, D09, D10, D11, D17, D26 —
// had zero inbound links from any of the 26 town pages, because their district
// simply has no town in TOWN_DISTRICT to match against.
export const UNMAPPED_DISTRICT_FALLBACK = {
  D02: 'bukit-merah', // Tanjong Pagar/Anson — borders Tiong Bahru/Alexandra
  D04: 'bukit-merah', // Telok Blangah/Keppel/Sentosa — HDB's own Bukit Merah town includes Telok Blangah
  D08: 'kallang-whampoa', // Little India/Farrer Park — borders Boon Keng/Whampoa
  D09: 'central-area', // Orchard/River Valley — closest existing "central" town page
  D10: 'bukit-timah', // Holland/Tanglin/Ardmore — closest namesake town page
  D11: 'toa-payoh', // Novena/Watten Estate — borders Toa Payoh
  D17: 'pasir-ris', // Changi/Loyang — adjoins Pasir Ris along the east coast
  D24: 'choa-chu-kang', // Lim Chu Kang/Tengah — Tengah new town was carved from Choa Chu Kang
  D26: 'ang-mo-kio', // Upper Thomson/Springleaf — borders Ang Mo Kio/Bishan
};

// Inverted: town slug -> extra district(s) to pull launches from, beyond its own
// TOWN_DISTRICT entry. Derived so the two maps can't drift out of sync.
const EXTRA_DISTRICTS_BY_TOWN = Object.entries(UNMAPPED_DISTRICT_FALLBACK).reduce((acc, [district, slug]) => {
  (acc[slug] ||= []).push(district);
  return acc;
}, {});

const ACTIVE_STATUSES = new Set(['selling', 'upcoming']);

export function projectsByDistrictFromFile(projectsJson) {
  const map = new Map();
  for (const p of projectsJson.projects || []) {
    if (!ACTIVE_STATUSES.has(p.status)) continue;
    if (!map.has(p.district)) map.set(p.district, []);
    map.get(p.district).push(p);
  }
  return map;
}

export function crumbsNav(breadcrumbName, esc) {
  const last = breadcrumbName ? ` &rsaquo; <span>${esc(breadcrumbName)}</span>` : '';
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> &rsaquo; <a href="/hdb-prices/">HDB Prices by Town</a>${last}</nav>`;
}

export function nearbyTownsBlock(slug, townMeta) {
  const nearby = (NEARBY_TOWNS[slug] || []).filter((s) => s !== slug && townMeta.has(s)).slice(0, 6);
  if (!nearby.length) return '';
  const cards = nearby
    .map((s) => `    <a class="town-card" href="/hdb-prices/${s}/"><span class="t">${townMeta.get(s)}</span></a>`)
    .join('\n');
  return `  <h2>Nearby towns</h2>\n  <div class="town-grid">\n${cards}\n  </div>`;
}

export function newLaunchesBlock(slug, townTitle, projectsByDistrict, esc) {
  const districts = [TOWN_DISTRICT[slug], ...(EXTRA_DISTRICTS_BY_TOWN[slug] || [])].filter(Boolean);
  const launches = districts.flatMap((d) => projectsByDistrict.get(d) || []);
  if (!launches.length) return '';
  const items = launches
    .map((p) => `    <li><a href="${p.canonicalUrl}">${esc(p.name)}</a> — ${esc(p.location)}, ${p.district}</li>`)
    .join('\n');
  return `  <h2>New launches near ${esc(townTitle)}</h2>\n  <ul class="link-list">\n${items}\n  </ul>`;
}

export function readingBlock(townTitle, esc) {
  return `  <h2>Useful reading for ${esc(townTitle)} sellers</h2>
  <ul class="link-list">
    <li><a href="/insights/hdb-valuation-explained.html">How agents actually price a flat</a></li>
    <li><a href="/insights/how-long-to-sell-hdb-singapore-2026.html">How long it takes to sell in 2026</a></li>
    <li><a href="/insights/selling-hdb-after-mop-singapore.html">Selling after MOP: the 5-step timeline</a></li>
    <li><a href="/insights/property-agent-commission-singapore.html">What that 2% commission covers</a></li>
    <li><a href="/calculator/">Affordability calculator</a></li>
    <li><a href="/glossary/">Property glossary — CPF, OTP, MOP &amp; more</a></li>
  </ul>`;
}

export const ESTATE_LINKING_CSS = `.crumbs{max-width:1000px;margin:14px auto 0;padding:0 24px;font-size:0.82rem;color:#767676}.crumbs a{color:#767676}.crumbs a:hover{color:var(--emerald)}.link-list{list-style:none}.link-list li{padding:10px 0;border-bottom:1px solid rgba(11,30,63,0.06)}.link-list li:last-child{border-bottom:none}`;
