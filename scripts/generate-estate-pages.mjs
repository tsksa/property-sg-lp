#!/usr/bin/env node
// Generates /hdb-prices/<town>/ market pages + the /hdb-prices/ index from the
// official HDB Resale Flat Prices dataset on data.gov.sg (Open Data Licence).
//
// Run: node scripts/generate-estate-pages.mjs
// Dev: node scripts/generate-estate-pages.mjs --cache /tmp/hdb-cache.json
//      (reads the file if it exists, otherwise fetches and writes it; the
//      rental data is cached beside it as hdb-rent-cache.json)
// Refreshed monthly by .github/workflows/refresh-estate-pages.yml (opens a PR).
//
// Pages are generated to comply with scripts/check-consistency.mjs invariants.

import fs from 'node:fs';
import { siteFooterHtml } from './lib/site-footer.mjs';
import { siteHeaderHtml, SITE_THEME_ASSETS_HTML } from './lib/site-header.mjs';
import path from 'node:path';
import {
  crumbsNav,
  nearbyTownsBlock,
  newLaunchesBlock,
  readingBlock,
  projectsByDistrictFromFile,
  ESTATE_LINKING_CSS,
} from './lib/estate-linking.mjs';

import { monthsBack, resolveWindows, recentSales } from './lib/estate-windows.mjs';
import { buildTownSchema, buildHubSchema, faqHtml, townFacts, titleCase as title } from './lib/estate-schema.mjs';
import { leadCaptureHtml, LEAD_CAPTURE_CSS } from './lib/estate-lead-capture.mjs';
import { fontLinksHtml } from './lib/self-hosted-fonts.mjs';
import { valueCardHtml, rollingPsfSeries, likeForLikeChange, leaseBand, monthLabel, VALUE_CARD_CSS } from './lib/value-card.mjs';
import {
  typeStats, flatTypeSections, flatModelBlock, blockIndex, buyerSection, rentalSection, townDescription,
  leaseProfile, typeLabel, FLAT_TYPES, MIN_TYPE_SALES, RENT_DATASET, rentTown, DETAIL_BUDGET,
} from './lib/estate-sections.mjs';

const DATASET = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const API = 'https://data.gov.sg/api/action/datastore_search';
const OUT = 'hdb-prices';
const SITE = 'https://joetay.com';
// 12m window + 12m prior window for YoY + the current partial month, which is always
// discarded, + one month of slack so a publication lag at data.gov.sg can shift the
// anchor back without shortening either window.
const MONTHS_FETCHED = 26;

const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// data.gov.sg rate-limits anonymous callers (HTTP 429) after a burst of
// requests; back off and retry rather than abort a 26-month fetch half-way.
async function getJson(url, label) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url);
    if (res.status === 429 && attempt < 6) {
      const wait = 2000 * 2 ** attempt;
      console.log(`  ${label}: HTTP 429, retrying in ${wait / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    if (!res.ok) throw new Error(`data.gov.sg ${res.status} for ${label}`);
    const j = await res.json();
    if (!j.success) throw new Error(`API failure for ${label}`);
    return j.result.records;
  }
}

async function fetchMonth(month) {
  const filters = encodeURIComponent(JSON.stringify({ month }));
  return getJson(`${API}?resource_id=${DATASET}&filters=${filters}&limit=5000`, month);
}

const months = monthsBack(MONTHS_FETCHED);
const cacheIdx = process.argv.indexOf('--cache');
const cacheFile = cacheIdx !== -1 ? process.argv[cacheIdx + 1] : null;
const rentCacheFile = cacheFile ? path.join(path.dirname(cacheFile), 'hdb-rent-cache.json') : null;
let all = [];
if (cacheFile && fs.existsSync(cacheFile)) {
  console.log(`Using cached data.gov.sg payload: ${cacheFile}`);
  all = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
} else {
  console.log(`Fetching ${MONTHS_FETCHED} months from data.gov.sg…`);
  for (const m of months) {
    const recs = await fetchMonth(m);
    all.push(...recs);
    process.stdout.write(`  ${m}: ${recs.length}\n`);
  }
  if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify(all));
}
if (all.length < 5000) throw new Error(`suspiciously few records (${all.length}) — aborting rather than generating empty pages`);

// The current calendar month is always partial and is discarded — see
// scripts/lib/estate-windows.mjs. Including it made the "last 12 months" headline
// really 11 months plus a fragment while prior12 was a full 12, so the year-on-year
// figure compared mismatched windows, and it let a partial month be labelled
// "latest full month".
const monthsWithData = new Set(all.map((r) => r.month));
const { latestFullMonth, window12, prior12 } = resolveWindows(months, (m) => monthsWithData.has(m));
const SQM_TO_SQFT = 10.7639;

const byTown = new Map();
for (const r of all) {
  if (!byTown.has(r.town)) byTown.set(r.town, []);
  byTown.get(r.town).push(r);
}

const generatedAt = latestFullMonth; // data currency, not wall clock
const dataYear = latestFullMonth.slice(0, 4);
// The real generation date: dateModified on the WebPage and Dataset nodes and
// the sitemap lastmod (which refresh-sitemap-lastmod.mjs later reconciles).
const today = new Date().toISOString().slice(0, 10);
const freshness = `Data to ${monthLabel(latestFullMonth)} (data.gov.sg)`;

// ── HDB rental approvals (JOE-469) ──
// Same 12 months as the resale window, by rent approval month. A failed fetch
// leaves the rental sections out rather than failing the monthly refresh.
let rentByTown = new Map();
let rentMonths = [];
try {
  let rents = [];
  if (rentCacheFile && fs.existsSync(rentCacheFile)) {
    console.log(`Using cached rental payload: ${rentCacheFile}`);
    rents = JSON.parse(fs.readFileSync(rentCacheFile, 'utf8'));
  } else {
    console.log('Fetching 12 months of HDB rental approvals from data.gov.sg…');
    for (const m of window12) {
      const filters = encodeURIComponent(JSON.stringify({ rent_approval_date: m }));
      const recs = await getJson(`${API}?resource_id=${RENT_DATASET}&filters=${filters}&limit=10000`, `rent ${m}`);
      rents.push(...recs);
      process.stdout.write(`  rent ${m}: ${recs.length}\n`);
    }
    if (rentCacheFile) fs.writeFileSync(rentCacheFile, JSON.stringify(rents));
  }
  rents = rents.filter((r) => window12.includes(r.rent_approval_date));
  rentMonths = [...new Set(rents.map((r) => r.rent_approval_date))];
  if (rentMonths.length < 6) throw new Error(`only ${rentMonths.length} months of rental data in the window`);
  for (const r of rents) {
    const town = rentTown(r.town);
    if (!rentByTown.has(town)) rentByTown.set(town, []);
    rentByTown.get(town).push(r);
  }
} catch (err) {
  console.warn(`Rental data skipped: ${err.message}`);
  rentByTown = new Map();
  rentMonths = [];
}
const towns = [...byTown.keys()].sort();
console.log(`${towns.length} towns, ${all.length} transactions`);

function stats(recs, monthsSet) {
  const inWin = recs.filter((r) => monthsSet.includes(r.month));
  const prices = inWin.map((r) => Number(r.resale_price)).filter(Number.isFinite);
  const psf = inWin
    .map((r) => Number(r.resale_price) / (Number(r.floor_area_sqm) * SQM_TO_SQFT))
    .filter(Number.isFinite);
  return { n: inWin.length, med: median(prices), psf: median(psf), inWin };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Google truncates titles at roughly 60 characters (about 600px). Prefer the
// fuller wording and fall back to the shorter form only when a long town name
// (Kallang/Whampoa) would push past the budget. Measured on the decoded text.
function fitTitle(preferred, short) {
  const decoded = preferred.replace(/&amp;/g, '&');
  return decoded.length <= 60 ? preferred : short;
}

// Text colours (JOE-472): --emerald (#10b981) is only 2.5:1 on the cream page, so
// links and the eyebrow use --emerald-text (#047857 light, #6ee7c1 dark, the
// JOE-461 tokens) and small grey text uses --muted (#6b6b6b, 5.1:1; #c1cad8 dark).
// Links inside running text are underlined so they do not rely on colour alone.
// Emerald stays for fills and focus rings; a filled emerald or WhatsApp-green
// button carries the dark --emerald-ink label.
function pageShell({ path: pagePath, titleTag, desc, h1, lede, srcLine, body, breadcrumbName, extraSchema, leadScripts, leadCapture }) {
  const canonical = `${SITE}${pagePath}`;
  return `<!DOCTYPE html>
<html lang="en-SG">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titleTag}</title>
<meta name="description" content="${desc}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="theme-color" content="#0b1e3f">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en-SG" href="${canonical}">
<link rel="alternate" hreflang="x-default" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PropertySG">
<meta property="og:title" content="${titleTag}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="en_SG">
<meta property="og:image" content="${SITE}/joetay-social-preview.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%230b1e3f'/%3E%3Ctext x='50' y='70' font-family='Georgia,serif' font-size='60' font-weight='700' text-anchor='middle' fill='%2310b981'%3EP%3C/text%3E%3C/svg%3E">
<link rel="manifest" href="/site.webmanifest">
${fontLinksHtml()}
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: titleTag,
  url: canonical,
  description: desc,
  inLanguage: 'en-SG',
  dateModified: today,
  isPartOf: { '@type': 'WebSite', name: 'PropertySG', url: SITE + '/' },
  // The same entity as the homepage's RealEstateAgent node.
  publisher: { '@type': 'RealEstateAgent', '@id': `${SITE}/#agent`, name: 'PropertySG', url: SITE + '/' },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'HDB Prices by Town', item: SITE + '/hdb-prices/' },
      ...(breadcrumbName ? [{ '@type': 'ListItem', position: 3, name: breadcrumbName, item: canonical }] : []),
    ],
  },
}, null, 1)}
</script>
${extraSchema ? `<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': extraSchema }, null, 1)}
</script>
` : ''}<script src="/assets/analytics-loader.js" defer data-meta="false"></script>
${leadScripts ? `
<script src="/js/recaptcha-helper.js" defer></script>
<script src="/js/estate-lead.js" defer></script>` : ''}
<style>
.skip-link{position:absolute;left:-9999px;top:0;z-index:10050;background:#0b1e3f;color:#fff;padding:12px 20px;border-radius:0 0 10px 0;font-weight:700;font-size:0.9rem;text-decoration:none}.skip-link:focus{left:0;outline:2px solid #10b981;outline-offset:2px}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--navy:#0b1e3f;--navy-2:#061430;--emerald:#10b981;--emerald-dark:#059669;--emerald-aa:#047857;--emerald-text:#047857;--emerald-ink:#04231a;--muted:#6b6b6b;--cream:#faf6ec}
html.jt-theme-dark{--emerald-text:#6ee7c1;--muted:#c1cad8}
body{font-family:'DM Sans',sans-serif;color:#1a1a1a;background:#fdfbf6;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--emerald-text);text-decoration:none}a:hover{text-decoration:underline}
main p a:not([class]),footer p a{text-decoration:underline}
main{max-width:1000px;margin:0 auto;padding:40px 24px 72px}
.eyebrow{display:inline-block;font-size:0.72rem;font-weight:700;color:var(--emerald-text);letter-spacing:2px;text-transform:uppercase;padding:6px 14px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:100px;margin-bottom:16px}
h1{font-family:'Fraunces',Georgia,serif;font-size:clamp(1.8rem,4.5vw,2.6rem);font-weight:700;letter-spacing:-0.8px;line-height:1.12;color:var(--navy);margin-bottom:12px}
.lede{color:#555;max-width:640px;margin-bottom:8px}
.src{font-size:0.78rem;color:var(--muted);margin-bottom:30px}
${VALUE_CARD_CSS}
h2{font-family:'Fraunces',Georgia,serif;font-size:1.35rem;color:var(--navy);letter-spacing:-0.3px;margin:34px 0 14px}
.tbl{overflow-x:auto;background:#fff;border:1px solid rgba(11,30,63,0.08);border-radius:14px}
.faq{margin-top:8px}${LEAD_CAPTURE_CSS}
.faq-item{border:1px solid rgba(11,30,63,0.12);border-radius:10px;padding:12px 16px;margin-bottom:10px;background:#fff}
.faq-item summary{cursor:pointer;font-weight:600;color:var(--navy)}
.faq-item summary:focus-visible{outline:2px solid var(--emerald);outline-offset:2px}
.faq-item p{margin-top:8px;color:#444}
table{width:100%;border-collapse:collapse;font-size:0.88rem;min-width:520px}
th{font-size:0.7rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);text-align:left;padding:12px 16px;border-bottom:1px solid rgba(11,30,63,0.08)}
td{padding:11px 16px;border-bottom:1px solid rgba(11,30,63,0.05)}
tr:last-child td{border-bottom:none}
td:nth-child(n+2),th:nth-child(n+2){text-align:right}
.tbl table.mini{min-width:0}
.tbl table.mini th,.tbl table.mini td{padding:9px 12px}
.tbl table.mini td{white-space:nowrap}
.tbl table.mini td.l,details.blk td:nth-child(4){white-space:normal}
.tbl td.l,.tbl th.l{text-align:left}
.tbl+.tbl{margin-top:12px}
section[data-est] p{margin-bottom:10px}
details.blk{border:1px solid rgba(11,30,63,0.12);border-radius:10px;padding:10px 14px;margin-bottom:8px;background:#fff}
details.blk summary{cursor:pointer;font-weight:600;color:var(--navy)}
details.blk summary:focus-visible{outline:2px solid var(--emerald);outline-offset:2px}
details.blk .tbl{margin-top:10px;border:0}
details.blk td:nth-child(4),details.blk th:nth-child(4){text-align:left}
.hub-tbl table{min-width:760px;font-size:0.82rem}
.hub-tbl th,.hub-tbl td{padding:9px 10px}
.hub-tbl tfoot td{font-weight:700;border-top:1px solid rgba(11,30,63,0.12)}
.hub-tbl th button{font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.hub-tbl th button:focus-visible{outline:2px solid var(--emerald);outline-offset:2px}
.callouts{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:16px 0}
.callouts p{background:#fff;border:1px solid rgba(11,30,63,0.08);border-radius:12px;padding:14px 16px}
html.jt-theme-dark :is(.callouts p,details.blk){background:#102447;border-color:rgba(255,255,255,.12);color:#c1cad8;box-shadow:none}
html.jt-theme-dark :is(.callouts strong,details.blk summary){color:#f8fafc}
.town-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.town-card{background:#fff;border:1px solid rgba(11,30,63,0.08);border-radius:12px;padding:16px 18px;display:block;color:inherit}
.town-card:hover{border-color:rgba(16,185,129,0.4);text-decoration:none}
.town-card .t{font-weight:700;color:var(--navy)}
.town-card .m{font-size:0.82rem;color:var(--muted);margin-top:3px}
.cta{background:linear-gradient(135deg,var(--navy),var(--navy-2));border-radius:16px;color:#fff;padding:28px;margin-top:40px}
.cta h2{color:#fff;margin:0 0 8px}
.cta p{color:rgba(255,255,255,0.85);max-width:560px;margin-bottom:16px}
.cta .btns{display:flex;gap:10px;flex-wrap:wrap}
.cta a.primary{background:var(--emerald);color:var(--emerald-ink);font-weight:700;padding:12px 22px;border-radius:10px}
.cta a.secondary{border:1px solid rgba(255,255,255,0.35);color:#fff;font-weight:600;padding:12px 22px;border-radius:10px}
footer{max-width:1000px;margin:0 auto;padding:0 24px 40px;font-size:0.78rem;color:var(--muted)}
a:focus-visible{outline:2px solid var(--emerald);outline-offset:3px;border-radius:4px}
${ESTATE_LINKING_CSS}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${siteHeaderHtml({ pagePath })}
${crumbsNav(breadcrumbName, esc)}
<main id="main" tabindex="-1">
  <div class="eyebrow">Official HDB data · Updated monthly</div>
  <h1>${h1}</h1>
  <p class="lede">${lede}</p>
  <p class="src">${srcLine}</p>
${body}
  <div class="cta">
    <h2>What would <em>your</em> flat fetch?</h2>
    <p>The medians above are town-wide. Your block, storey, and renovation state move the number — check the actual sales in your block, or get a considered valuation from me on WhatsApp within 24 hours.</p>
    <div class="btns">
      <a class="secondary" href="/neighbour-prices/">Check your block's sold prices</a>
      <a class="primary" href="/stamp-duty-calculator/">Work out your stamp duty →</a>
    </div>
${leadCapture || ''}
  </div>
</main>
<footer>\n${siteFooterHtml()}
  <p>Contains information from the <a href="https://data.gov.sg/datasets/${DATASET}/view" target="_blank" rel="noopener">HDB Resale Flat Prices</a> dataset accessed via data.gov.sg, made available under the <a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noopener">Singapore Open Data Licence v1.0</a>. Medians are indicative, not a valuation. PropertySG · Joe Tay, District Director, ERA · CEA R009618D.</p>
</footer>
</body>
</html>
`;
}

// ── Town pages ──
// Pre-compute which towns clear the tx threshold and will actually get a
// page, so the nearby-towns block only ever links to real, in-bundle pages.
const townMeta = new Map(); // slug -> title
for (const town of towns) {
  if (stats(byTown.get(town), window12).n < 20) continue;
  townMeta.set(slug(town), title(town));
}
const projectsJson = JSON.parse(fs.readFileSync('new-launches/projects.json', 'utf8'));
const projectsByDistrict = projectsByDistrictFromFile(projectsJson);

const indexRows = [];
for (const town of towns) {
  const recs = byTown.get(town);
  const cur = stats(recs, window12);
  if (cur.n < 20) { console.log(`  skip ${town} (only ${cur.n} tx in 12m)`); continue; }
  const t = title(town);
  const s = slug(town);
  // Like for like: the same flat types and lease ages compared with
  // themselves, so a year with more newer flats selling is not reported as a
  // price rise. See likeForLikeChange() in scripts/lib/value-card.mjs.
  const likeForLike = {
    monthOf: (r) => r.month,
    psfOf: (r) => Number(r.resale_price) / (Number(r.floor_area_sqm) * SQM_TO_SQFT),
    stratumOf: (r) => `${r.flat_type}|${leaseBand(r.lease_commence_date)}`,
  };
  const yoy = likeForLikeChange(window12, prior12, recs, likeForLike);

  // per-flat-type table (12m)
  const typeRows = FLAT_TYPES.map((ft) => {
    const tx = cur.inWin.filter((r) => r.flat_type === ft);
    if (tx.length < 5) return null;
    const p = median(tx.map((r) => Number(r.resale_price)));
    const area = median(tx.map((r) => Number(r.floor_area_sqm)));
    const label = ft === 'EXECUTIVE' ? 'Executive (incl. maisonette)' : title(ft);
    const cell = tx.length >= MIN_TYPE_SALES ? `<a href="#${typeLabel(ft).toLowerCase()}">${label}</a>` : label;
    return `<tr><td>${cell}</td><td>${money(p)}</td><td>${Math.round(area)} sqm</td><td>${tx.length}</td></tr>`;
  }).filter(Boolean).join('\n      ');
  // JOE-469: per-flat-type sections, FAQ and description (types with ≥10 sales).
  const types = typeStats(cur.inWin);

  // Prices by street (JOE-345): the town pages shared one template and differed
  // only in their figures, and Google crawled Bedok on 15 Oct 2026 but chose
  // not to index it. A street breakdown from the same 12-month rows gives each
  // page local detail no other town page has. Streets with under 10 sales are
  // left out so one odd sale cannot set a median; small towns where fewer than
  // three streets reach that (Bukit Timah) fall back to five.
  const byStreet = new Map();
  for (const r of cur.inWin) {
    if (!byStreet.has(r.street_name)) byStreet.set(r.street_name, []);
    byStreet.get(r.street_name).push(r);
  }
  const minStreetSales = [...byStreet.values()].filter((tx) => tx.length >= 10).length >= 3 ? 10 : 5;
  const streetRows = [...byStreet.entries()]
    .filter(([, tx]) => tx.length >= minStreetSales)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([street, tx]) => {
      const psf = median(tx.map((r) => Number(r.resale_price) / (Number(r.floor_area_sqm) * SQM_TO_SQFT)).filter(Number.isFinite));
      const four = tx.filter((r) => r.flat_type === '4 ROOM').map((r) => Number(r.resale_price));
      return `<tr><td style="text-align:left">${esc(title(street))}</td><td>${tx.length}</td><td>${'$' + Math.round(psf)}</td><td>${four.length >= 5 ? money(median(four)) : '—'}</td></tr>`;
    })
    .join('\n      ');
  const streetTable = streetRows ? `
  <h2>${t} HDB resale prices by street</h2>
  <p class="src">The ${t} streets with the most resale sales in the last 12 months (at least ${minStreetSales} each). Median $psf compares flats of different sizes; the 4-room median is shown where a street had at least five 4-room sales.</p>
  <div class="tbl"><table>
    <thead><tr><th style="text-align:left">Street</th><th>Sales</th><th>Median $psf</th><th>4-room median</th></tr></thead>
    <tbody>
      ${streetRows}
    </tbody>
  </table></div>` : '';

  // Newest full month first, a mix of flat types — see recentSales().
  const latest = recentSales(recs, window12)
    .map((r) => `<tr><td>${r.month}</td><td style="text-align:left">${esc(title(r.flat_type))} · Blk ${esc(r.block)} ${esc(title(r.street_name))}</td><td>${esc(r.storey_range)}</td><td>${money(Number(r.resale_price))}</td></tr>`)
    .join('\n      ');

  const desc = townDescription({ t, types, n: cur.n, latestFullMonth: generatedAt });

  // The detail sections share one byte budget so the page stays light: the
  // block index takes what the others leave, raising its minimum sales per
  // block until it fits (DETAIL_BUDGET; tests/estate-sections.test.mjs).
  const detail = [
    flatTypeSections({ t, types, window12, esc }),
    flatModelBlock({ t, inWin: cur.inWin, esc }),
  ].filter(Boolean).join('\n');
  const rent = rentalSection({ t, rents: rentByTown.get(town), rentMonths, types, esc });
  const buyer = buyerSection({ t, esc });
  const blockBudget = DETAIL_BUDGET - Buffer.byteLength(detail + rent + buyer);
  let blocks = { html: '', blocks: 0 };
  for (let minSales = 2; minSales <= 20; minSales += 1) {
    const candidate = blockIndex({ t, inWin: cur.inWin, latestFullMonth: generatedAt, esc, minSales });
    if (Buffer.byteLength(candidate.html) <= blockBudget) { blocks = candidate; break; }
  }
  const profile = leaseProfile(cur.inWin);

  const series = rollingPsfSeries(window12, recs, { ...likeForLike, level: cur.psf });
  const body = `${valueCardHtml({
    heading: `Typical HDB resale price in ${t}`,
    prices: cur.inWin.map((r) => Number(r.resale_price)).filter(Number.isFinite),
    med: cur.med,
    psf: cur.psf,
    n: cur.n,
    yoy,
    latestFullMonth: generatedAt,
    scope: 'all flat types',
    series,
    mixNote: 'Weighted to the year’s mix of flat types and lease ages, so a run of newer flats selling does not show up as a price rise.',
  })}
  <h2>Median price by flat type (last 12 months)</h2>
  <div class="tbl"><table>
    <thead><tr><th>Flat type</th><th>Median price</th><th>Median size</th><th>Sales</th></tr></thead>
    <tbody>
      ${typeRows}
    </tbody>
  </table></div>
${detail}${streetTable}
${blocks.html}
  <h2>Most recent transactions</h2>
  <div class="tbl"><table>
    <thead><tr><th>Month</th><th style="text-align:left">Flat</th><th>Storey</th><th>Price</th></tr></thead>
    <tbody>
      ${latest}
    </tbody>
  </table></div>
${[rent, buyer, nearbyTownsBlock(s, townMeta), newLaunchesBlock(s, t, projectsByDistrict, esc), readingBlock(t, esc, profile)].filter(Boolean).join('\n')}`;

  const canonical = `${SITE}/hdb-prices/${s}/`;
  // Busiest streets and the highest sale, counted from the same 12-month rows.
  const facts = townFacts(cur.inWin);
  const extraSchema = buildTownSchema({ t, canonical, generatedAt, window12, cur, yoy, DATASET, API, facts, types, dateModified: today, rentDataset: rent ? RENT_DATASET : null });
  // FAQPage markup requires the Q&A to be visible on the page, so render it from
  // the same node that becomes the JSON-LD.
  const bodyWithFaq = `${body}
${faqHtml(extraSchema[1], esc)}`;

  fs.mkdirSync(path.join(OUT, s), { recursive: true });
  fs.writeFileSync(path.join(OUT, s, 'index.html'), pageShell({
    path: `/hdb-prices/${s}/`,
    titleTag: fitTitle(`${t} HDB Resale Prices ${dataYear} by Flat Type | PropertySG`, `${t} HDB Resale Prices by Flat Type | PropertySG`),
    desc: esc(desc),
    h1: `${t} HDB resale prices`,
    lede: `${t} HDB resale flat prices by flat type, street and block. Every figure comes from registered resale transactions in ${t} — no estimates, no modelling.`,
    srcLine: `${freshness} · HDB Resale Flat Prices dataset · figures below cover the 12 months ${monthLabel(window12[11])} to ${monthLabel(generatedAt)} unless stated.`,
    body: bodyWithFaq,
    breadcrumbName: t,
    extraSchema,
    leadScripts: true,
    leadCapture: leadCaptureHtml(t, esc),
  }));
  indexRows.push({
    town: t, s, med: cur.med, n: cur.n, psf: cur.psf, yoy,
    types: Object.fromEntries(types.map((ts) => [ts.ft, { med: ts.med, n: ts.n }])),
  });
}

// ── Index page ──
// JOE-469: the hub had no table, and its "lowest median" FAQ named a town of
// mostly smaller flats. Now one row per town with medians by flat type, plus
// a Singapore row from the same 12-month rows; cells under MIN_TYPE_SALES
// sales show '–'. The sort script only adds buttons; without it the table is
// a plain table.
const allInWin = towns.flatMap((town) => stats(byTown.get(town), window12).inWin);
const sgCur = stats(allInWin, window12);
const sgYoy = likeForLikeChange(window12, prior12, all, {
  monthOf: (r) => r.month,
  psfOf: (r) => Number(r.resale_price) / (Number(r.floor_area_sqm) * SQM_TO_SQFT),
  stratumOf: (r) => `${r.town}|${r.flat_type}|${leaseBand(r.lease_commence_date)}`,
});
const singapore = {
  med: sgCur.med, n: sgCur.n, psf: sgCur.psf, yoy: sgYoy,
  types: Object.fromEntries(typeStats(sgCur.inWin).map((ts) => [ts.ft, { med: ts.med, n: ts.n }])),
};
const HUB_TYPES = ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE'];
const pct = (v) => (v === null ? '–' : Math.abs(v) < 0.05 ? '0.0%' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`);
const hubCells = (r) => [
  `<td data-v="${Math.round(r.med)}">${money(r.med)}</td>`,
  `<td data-v="${r.yoy === null ? '' : r.yoy.toFixed(1)}">${pct(r.yoy)}</td>`,
  `<td data-v="${Math.round(r.psf)}">$${Math.round(r.psf)}</td>`,
  ...HUB_TYPES.map((ft) => (r.types[ft] ? `<td data-v="${Math.round(r.types[ft].med)}">${money(r.types[ft].med)}</td>` : '<td data-v="">–</td>')),
  `<td data-v="${r.n}">${r.n.toLocaleString('en-SG')}</td>`,
].join('');
const hubRows = indexRows
  .map((r) => `      <tr><td data-v="${esc(r.town)}"><a href="/hdb-prices/${r.s}/">${esc(r.town)}</a></td>${hubCells(r)}</tr>`)
  .join('\n');
const fourRoom = indexRows.filter((r) => r.types['4 ROOM']).sort((a, b) => a.types['4 ROOM'].med - b.types['4 ROOM'].med);
const callout = (label, r) => `    <p><strong>${label}</strong><br><a href="/hdb-prices/${r.s}/#4-room">${esc(r.town)}</a>: median ${money(r.types['4 ROOM'].med)} across ${r.types['4 ROOM'].n} sales.</p>`;
const callouts = fourRoom.length >= 2 ? `  <div class="callouts">
${callout('Cheapest town for a 4-room resale flat', fourRoom[0])}
${callout('Most expensive town for a 4-room resale flat', fourRoom[fourRoom.length - 1])}
  </div>` : '';
// The hub FAQ leaves the cheapest 4-room and 5-room towns to this article
// (HUB_CHEAPEST_SKIP in estate-schema.mjs); link it beside the call-outs.
const cheapestLink = `  <p>Every town ranked by 4-room and 5-room median, with remaining lease, is in <a href="/insights/cheapest-4-room-5-room-hdb-resale-flats.html">cheapest 4-room and 5-room towns explained</a>.</p>`;
const hubTable = `  <h2>HDB resale prices by town and flat type</h2>
  <p class="src">12-month medians to ${monthLabel(generatedAt)}. Year on year is like for like (the same flat types and lease ages compared with themselves). '–' means fewer than ${MIN_TYPE_SALES} sales of that flat type. Select a column heading to sort.</p>
  <div class="tbl hub-tbl"><table id="town-table">
    <thead><tr><th scope="col">Town</th><th scope="col">Median</th><th scope="col">Year on year</th><th scope="col">Median $psf</th>${HUB_TYPES.map((ft) => `<th scope="col">${typeLabel(ft)}</th>`).join('')}<th scope="col">Sales</th></tr></thead>
    <tbody>
${hubRows}
    </tbody>
    <tfoot>
      <tr><td>Singapore</td>${hubCells(singapore)}</tr>
    </tfoot>
  </table></div>
${callouts}
${cheapestLink}
  <script>
  (function () {
    var table = document.getElementById('town-table');
    if (!table || !table.tBodies.length) return;
    var heads = table.tHead.rows[0].cells;
    var body = table.tBodies[0];
    Array.prototype.forEach.call(heads, function (th, col) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = th.textContent;
      th.textContent = '';
      th.appendChild(btn);
      btn.addEventListener('click', function () {
        var asc = th.getAttribute('aria-sort') !== 'ascending';
        Array.prototype.forEach.call(heads, function (h) { h.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        var rows = Array.prototype.slice.call(body.rows);
        rows.sort(function (a, b) {
          var x = a.cells[col].getAttribute('data-v'), y = b.cells[col].getAttribute('data-v');
          if (x === y) return 0;
          if (x === '') return 1;
          if (y === '') return -1;
          var nx = Number(x), ny = Number(y);
          var cmp = isNaN(nx) || isNaN(ny) ? x.localeCompare(y) : nx - ny;
          return asc ? cmp : -cmp;
        });
        rows.forEach(function (row) { body.appendChild(row); });
      });
    });
  })();
  </script>`;
const hubSchema = buildHubSchema({ canonical: `${SITE}/hdb-prices/`, generatedAt, indexRows, DATASET, API, singapore, dateModified: today });
fs.writeFileSync(path.join(OUT, 'index.html'), pageShell({
  path: '/hdb-prices/',
  titleTag: `HDB Resale Prices ${dataYear} by Town &amp; Flat Type | PropertySG`,
  desc: `HDB resale prices for all ${indexRows.length} towns by flat type: 12-month medians for 2-room to Executive flats, $psf and like-for-like change, from data.gov.sg.`,
  h1: `HDB resale prices ${dataYear}: every town, every flat type`,
  lede: 'Medians by town and flat type from every registered HDB resale transaction in the last 12 months. Pick a town for prices by street and block.',
  srcLine: `${freshness} · HDB Resale Flat Prices dataset · figures cover the 12 months ${monthLabel(window12[11])} to ${monthLabel(generatedAt)}.`,
  body: `${hubTable}
  <h2>Selling? Check what flats like yours transacted for</h2>
  <p>Town medians mix every block and storey. Open your town for sales by flat type, street and block, look up <a href="/neighbour-prices/">your own block's sold prices</a>, or ask me for a <a href="/valuation.html">free valuation</a> based on the sales nearest your flat.</p>
  <div class="cta">\n    <h2>Can your budget reach your target town?</h2>\n    <p>Use your household income, cash and CPF to estimate your HDB loan, maximum property budget and monthly repayment.</p>\n    <div class="btns"><a class="primary" href="/calculator/">Use the HDB loan calculator →</a></div>\n  </div>\n${faqHtml(hubSchema[1], esc)}`,
  breadcrumbName: null,
  extraSchema: hubSchema,
}));

// ── Sitemap upkeep (managed block) ──
let sm = fs.readFileSync('sitemap.xml', 'utf8');
sm = sm.replace(/  <!-- hdb-prices:start -->[\s\S]*?<!-- hdb-prices:end -->\n/g, '');
// The real generation date, not the data month. lastmod is a crawl-scheduling
// hint about the PAGE, and these pages change (schema, links, copy) far more
// often than the dataset month rolls over. refresh-sitemap-lastmod.mjs later
// reconciles this against git history.
const entries = ['/hdb-prices/', ...indexRows.map((r) => `/hdb-prices/${r.s}/`)]
  .map((p) => `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`)
  .join('\n');
sm = sm.replace('</urlset>', `  <!-- hdb-prices:start -->\n${entries}\n  <!-- hdb-prices:end -->\n</urlset>`);
fs.writeFileSync('sitemap.xml', sm);

console.log(`Generated ${indexRows.length} town pages + index; sitemap updated.`);
