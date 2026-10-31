#!/usr/bin/env node
// Generates /condo-prices/<dNN>/ market pages + the /condo-prices/ index from
// URA's PMI_Resi_Transaction service (private residential caveats).
//
// Run:   URA_ACCESS_KEY=... node scripts/generate-condo-pages.mjs
// Dev:   node scripts/generate-condo-pages.mjs --cache /tmp/ura-cache.json
// Refreshed monthly by .github/workflows/refresh-condo-pages.yml (opens a PR).
//
// Mirrors generate-estate-pages.mjs deliberately — same page shell, same
// window/anchoring rules (scripts/lib/estate-windows.mjs), same visible-FAQ
// contract — so the two clusters stay maintainable as one pattern.

import fs from 'node:fs';
import path from 'node:path';
import { siteFooterHtml } from './lib/site-footer.mjs';
import { siteHeaderHtml, SITE_THEME_ASSETS_HTML } from './lib/site-header.mjs';
import { monthsBack, resolveWindows } from './lib/estate-windows.mjs';
import { faqHtml } from './lib/estate-schema.mjs';
import { buildDistrictSchema } from './lib/condo-schema.mjs';
import { DISTRICTS } from './lib/condo-districts.mjs';
import { fontLinksHtml } from './lib/self-hosted-fonts.mjs';
import {
  isCondoResale, toYearMonth, windowStats, median, psf, bandFor, SIZE_BANDS, SQM_TO_SQFT,
  projectRows, minProjectSales, tenureSplit, districtDescription, monthLabel, dateLabel, launchDetail,
} from './lib/condo-stats.mjs';
import { hdbTownsForDistrict } from './lib/district-town-map.mjs';
import { valueCardHtml, rollingPsfSeries, likeForLikeChange, leaseBand, VALUE_CARD_CSS } from './lib/value-card.mjs';

const OUT = 'condo-prices';
const SITE = 'https://joetay.com';
const MONTHS_FETCHED = 26; // same sizing rationale as the estate generator
const MIN_TX_12M = 30;     // districts under this get no page (D06 today)

const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const psfMoney = (n) => '$' + Math.round(n).toLocaleString('en-SG');
const today = new Date().toISOString().slice(0, 10);
const PROJECT_TABLE_TOP = 20; // rows beyond this sit in a collapsed <details>

// ── Fetch ──
async function fetchAllBatches() {
  const cacheIdx = process.argv.indexOf('--cache');
  if (cacheIdx !== -1) {
    const file = process.argv[cacheIdx + 1];
    console.log(`Using cached URA payload: ${file}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const KEY = process.env.URA_ACCESS_KEY;
  if (!KEY) throw new Error('URA_ACCESS_KEY is not set (see scripts/probe-ura.mjs)');
  const tokenRes = await fetch('https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1', { headers: { AccessKey: KEY } });
  const token = (await tokenRes.json()).Result;
  if (!token || token.length < 10) throw new Error('URA token handshake failed — run scripts/probe-ura.mjs');
  const all = [];
  for (let b = 1; b <= 4; b++) {
    const r = await fetch(`https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1?service=PMI_Resi_Transaction&batch=${b}`, { headers: { AccessKey: KEY, Token: token } });
    const j = await r.json();
    if (!Array.isArray(j.Result)) throw new Error(`URA batch ${b} returned no Result array`);
    console.log(`  batch ${b}: ${j.Result.length} projects`);
    all.push(...j.Result);
  }
  return all;
}

const projects = await fetchAllBatches();
const rows = projects
  .flatMap((p) => (p.transaction ?? []).map((t) => ({ ...t, project: p.project, street: p.street })))
  .filter(isCondoResale);
if (rows.length < 10000) {
  throw new Error(`suspiciously few condo resale records (${rows.length}) — aborting rather than generating empty pages`);
}

const monthsWithData = new Set(rows.map((r) => toYearMonth(r.contractDate)));
const months = monthsBack(MONTHS_FETCHED);
const { latestFullMonth, window12, prior12 } = resolveWindows(months, (m) => monthsWithData.has(m));
const generatedAt = latestFullMonth;

const byDistrict = new Map();
for (const r of rows) {
  if (!byDistrict.has(r.district)) byDistrict.set(r.district, []);
  byDistrict.get(r.district).push(r);
}
console.log(`${byDistrict.size} districts, ${rows.length} condo resale transactions, window to ${generatedAt}`);
// The trend line groups sales by tenure. If URA ever drops or renames the
// field, every sale lands in '?' and the line silently degrades to size-only
// adjustment, so say how much of the data the grouping could read.
const tenureRead = rows.filter((r) => tenureBand(r.tenure) !== '?').length;
console.log(`tenure readable for ${((tenureRead / rows.length) * 100).toFixed(1)}% of sales (trend-line grouping)`);

// Which districts clear the threshold and get a page (drives interlinking).
const live = new Map(); // '01' -> stats
for (const [d, recs] of [...byDistrict.entries()].sort()) {
  const cur = windowStats(recs, window12);
  if (cur.n >= MIN_TX_12M) live.set(d, cur);
  else console.log(`  skip D${d} (only ${cur.n} tx in 12m)`);
}

// Like-for-like tenure group for the trend line: freehold (and 999-/9999-year) in
// one group, leaseholds by the year their lease started, which tracks the
// building's age. URA writes e.g. "99 yrs lease commencing from 2012".
function tenureBand(tenure) {
  const t = String(tenure ?? '');
  if (/freehold|999/i.test(t)) return 'freehold';
  const y = t.match(/(19|20)\d{2}/);
  return y ? leaseBand(y[0]) : '?';
}

// Google truncates titles at roughly 60 characters. Long area names (Upper Bukit
// Timah, Upper Thomson) fall back to the D-number shorthand Singaporeans use.
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
function pageShell({ path: pagePath, titleTag, desc, h1, lede, body, breadcrumbName, extraSchema, waMessage }) {
  const canonical = `${SITE}${pagePath}`;
  const wa = encodeURIComponent(waMessage);
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
  publisher: { '@type': 'RealEstateAgent', '@id': `${SITE}/#agent`, name: 'PropertySG', url: SITE + '/' },
  breadcrumb: {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Condo Prices by District', item: SITE + '/condo-prices/' },
      ...(breadcrumbName ? [{ '@type': 'ListItem', position: 3, name: breadcrumbName, item: canonical }] : []),
    ],
  },
}, null, 1)}
</script>
${extraSchema ? `<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': extraSchema }, null, 1)}
</script>
` : ''}<script src="/assets/analytics-loader.js" defer data-meta="false"></script>
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
.faq{margin-top:8px}
.faq-item{border:1px solid rgba(11,30,63,0.12);border-radius:10px;padding:12px 16px;margin-bottom:10px;background:#fff}
.faq-item summary{cursor:pointer;font-weight:600;color:var(--navy)}
.faq-item summary:focus-visible{outline:2px solid var(--emerald);outline-offset:2px}
.faq-item p{margin-top:8px;color:#444}
table{width:100%;border-collapse:collapse;font-size:0.88rem;min-width:520px}
th{font-size:0.7rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);text-align:left;padding:12px 16px;border-bottom:1px solid rgba(11,30,63,0.08)}
td{padding:11px 16px;border-bottom:1px solid rgba(11,30,63,0.05)}
tr:last-child td{border-bottom:none}
td:nth-child(n+2),th:nth-child(n+2){text-align:right}
.ptbl table{min-width:720px}
.ptbl td:nth-child(-n+3),.ptbl th:nth-child(-n+3){text-align:left}
.more{margin-top:10px}
.more summary{cursor:pointer;font-weight:600;color:var(--navy);padding:8px 0}
.more summary:focus-visible{outline:2px solid var(--emerald);outline-offset:2px}
.more .tbl{margin-top:8px}
.launches{list-style:none}
.launches li{padding:7px 0;border-bottom:1px solid rgba(11,30,63,0.06)}
.launches li:last-child{border-bottom:none}
.launches .m{font-size:0.85rem;color:#555}
.fresh{font-weight:600;color:#555}
.town-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.town-card{background:#fff;border:1px solid rgba(11,30,63,0.08);border-radius:12px;padding:16px 18px;display:block;color:inherit}
.town-card:hover{border-color:rgba(16,185,129,0.4);text-decoration:none}
.town-card .t{font-weight:700;color:var(--navy)}
.town-card .m{font-size:0.82rem;color:var(--muted);margin-top:3px}
.nearby{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}
.nearby a{display:inline-block;background:#fff;border:1px solid rgba(11,30,63,0.12);border-radius:100px;padding:9px 16px;font-size:0.85rem;font-weight:600;color:var(--navy)}
.nearby a:hover{border-color:rgba(16,185,129,0.5);text-decoration:none}
.cta{background:linear-gradient(135deg,var(--navy),var(--navy-2));border-radius:16px;color:#fff;padding:28px;margin-top:40px}
.cta h2{color:#fff;margin:0 0 8px}
.cta p{color:rgba(255,255,255,0.85);max-width:560px;margin-bottom:16px}
.cta .btns{display:flex;gap:10px;flex-wrap:wrap}
.cta a.primary{background:#25D366;color:var(--emerald-ink);font-weight:700;padding:12px 22px;border-radius:10px}
.cta a.secondary{border:1px solid rgba(255,255,255,0.35);color:#fff;font-weight:600;padding:12px 22px;border-radius:10px}
@media(max-width:600px){.cta .btns a{display:block;width:100%;text-align:center}}
footer{max-width:1000px;margin:0 auto;padding:0 24px 40px;font-size:0.78rem;color:var(--muted)}
a:focus-visible{outline:2px solid var(--emerald);outline-offset:3px;border-radius:4px}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${siteHeaderHtml({ pagePath })}
<main id="main" tabindex="-1">
  <div class="eyebrow">Official URA caveat data · Updated monthly</div>
  <h1>${h1}</h1>
  <p class="lede">${lede}</p>
  <p class="src"><span class="fresh">Data to ${monthLabel(generatedAt)} (URA) · updated ${dateLabel(today)}</span><br>Source: URA private residential caveats (PMI_Resi_Transaction) · latest full month ${generatedAt} · resale condominiums and apartments only, single-unit deals · figures use the last 12 months unless stated.</p>
${body}
  <div class="cta">
    <h2>Thinking of selling — or hunting in this district?</h2>
    <p>Medians are district-wide. Your project, floor and facing move the number — WhatsApp me for a considered view within 24 hours, or work out the buy-side costs first.</p>
    <div class="btns">
      <a class="primary" href="https://wa.me/6581881488?text=${wa}" target="_blank" rel="noopener" data-cta="whatsapp-condo" onclick="if(typeof gtag==='function')gtag('event','whatsapp_cta_click',{cta_location:'condo-prices',district:'${breadcrumbName ? esc(breadcrumbName) : 'hub'}'});">WhatsApp Joe →</a>
      <a class="secondary" href="/valuation.html">Get a free valuation</a>
      <a class="secondary" href="/stamp-duty-calculator/">Work out stamp duty</a>
    </div>
  </div>
</main>
<footer>\n${siteFooterHtml()}
  <p>Based on caveat data from the <a href="https://eservice.ura.gov.sg/maps/api/" target="_blank" rel="noopener">URA Data Service</a> (PMI_Resi_Transaction), © Urban Redevelopment Authority. Medians are indicative, not a valuation. PropertySG · Joe Tay, District Director, ERA · CEA R009618D.</p>
</footer>
</body>
</html>
`;
}

// ── District pages ──
// New launches are joined read-only from the launch catalogue, and only those
// with a generated page are linked.
const launchesByDistrict = new Map();
for (const p of JSON.parse(fs.readFileSync('new-launches/projects.json', 'utf8')).projects ?? []) {
  if (!fs.existsSync(path.join('new-launches', `${p.slug}.html`))) continue;
  const key = String(p.district ?? '').replace(/^D/, '');
  if (!launchesByDistrict.has(key)) launchesByDistrict.set(key, []);
  launchesByDistrict.get(key).push(p);
}

const projectTableRow = (p) => `      <tr id="${p.id}"><td>${esc(p.project)}</td><td>${esc(p.street || '—')}</td><td>${esc(p.tenure)}</td><td>${p.n}</td><td>${psfMoney(p.psf)}</td><td>${money(p.med)}</td><td>${p.latest ? monthLabel(p.latest) : '—'}</td></tr>`;
const projectTable = (list) => `<div class="tbl ptbl"><table>
    <thead><tr><th>Project</th><th>Street</th><th>Tenure</th><th>Sales</th><th>Median $psf</th><th>Median price</th><th>Latest sale</th></tr></thead>
    <tbody>
${list.map(projectTableRow).join('\n')}
    </tbody>
  </table></div>`;

const indexRows = [];
for (const [d, cur] of live) {
  const recs = byDistrict.get(d);
  // Like for like: the same unit sizes and tenures compared with themselves.
  // See likeForLikeChange() in scripts/lib/value-card.mjs.
  const likeForLike = {
    monthOf: (r) => toYearMonth(r.contractDate),
    psfOf: psf,
    stratumOf: (r) => `${bandFor(r)?.label}|${tenureBand(r.tenure)}`,
  };
  const yoy = likeForLikeChange(window12, prior12, recs, likeForLike);
  const areaName = DISTRICTS[d];
  const dn = Number(d);
  const canonical = `${SITE}/condo-prices/d${d}/`;

  const bandRows = SIZE_BANDS.map((band) => {
    const tx = cur.inWin.filter((r) => bandFor(r) === band);
    if (tx.length < 5) return null;
    return `      <tr><td>${band.label}</td><td>${money(median(tx.map((r) => Number(r.price))))}</td><td>$${Math.round(median(tx.map(psf)))}</td><td>${tx.length}</td></tr>`;
  }).filter(Boolean).join('\n');

  const latest = cur.inWin
    .sort((a, b) => toYearMonth(b.contractDate).localeCompare(toYearMonth(a.contractDate)) || Number(b.price) - Number(a.price))
    .slice(0, 10)
    .map((r) => `      <tr><td>${toYearMonth(r.contractDate)}</td><td style="text-align:left">${esc(r.project)}</td><td>${Math.round(Number(r.area) * SQM_TO_SQFT).toLocaleString('en-SG')} sqft</td><td>${esc(r.floorRange ?? '—')}</td><td>${money(Number(r.price))}</td></tr>`)
    .join('\n');

  // adjacent live districts by number, three on each side max, capped at 6
  const nearby = [...live.keys()].filter((x) => x !== d)
    .sort((a, b) => Math.abs(Number(a) - dn) - Math.abs(Number(b) - dn))
    .slice(0, 6)
    .map((x) => `    <a href="/condo-prices/d${x}/">D${Number(x)} · ${esc(DISTRICTS[x].split(',')[0])}</a>`)
    .join('\n');

  const minSales = minProjectSales(cur.n);
  const projectList = projectRows(cur.inWin, minSales);
  const split = tenureSplit(cur.inWin);
  const extraSchema = buildDistrictSchema({
    d, areaName, canonical, generatedAt, window12, cur, yoy,
    projects: projectList, minSales, split, dateModified: today,
  });

  const projectSection = projectList.length ? `
  <h2>District ${dn} condo prices by project</h2>
  <p class="src" style="margin-bottom:12px">Projects with at least ${minSales} resale caveats in the 12 months to ${generatedAt}, most sales first. Project and street names as URA records them.</p>
  ${projectTable(projectList.slice(0, PROJECT_TABLE_TOP))}${projectList.length > PROJECT_TABLE_TOP ? `
  <details class="more"><summary>Show ${projectList.length - PROJECT_TABLE_TOP} more projects</summary>
  ${projectTable(projectList.slice(PROJECT_TABLE_TOP))}
  </details>` : ''}` : '';

  const splitSection = split.shown ? `
  <h2>Freehold vs 99-year leasehold (last 12 months)</h2>
  <div class="tbl"><table>
    <thead><tr><th>Tenure</th><th>Median $psf</th><th>Median price</th><th>Sales</th></tr></thead>
    <tbody>
      <tr><td>Freehold, 999- and 9999-year</td><td>${psfMoney(split.freehold.psf)}</td><td>${money(split.freehold.med)}</td><td>${split.freehold.n}</td></tr>
      <tr><td>99-year leasehold</td><td>${psfMoney(split.leasehold.psf)}</td><td>${money(split.leasehold.med)}</td><td>${split.leasehold.n}</td></tr>
    </tbody>
  </table></div>
  <p class="src" style="margin:8px 0 0">Not like for like: the two groups differ in age, location and unit size.</p>` : '';

  const launches = launchesByDistrict.get(d) ?? [];
  const launchSection = launches.length ? `
  <h2>New launches in District ${dn}</h2>
  <ul class="launches">
${launches.map((p) => `    <li><a href="/new-launches/${p.slug}.html">${esc(p.name)}</a> <span class="m">· ${esc(launchDetail(p))}</span></li>`).join('\n')}
  </ul>` : '';

  const towns = hdbTownsForDistrict(d).filter((t) => fs.existsSync(path.join('hdb-prices', t.slug, 'index.html')));
  const townSection = towns.length ? `
  <h2>Nearby HDB towns</h2>
  <p class="src" style="margin-bottom:6px">Upgrading from an HDB flat? These towns have HDB estates inside District ${dn}'s postal sectors.</p>
  <div class="nearby">
${towns.map((t) => `    <a href="/hdb-prices/${t.slug}/">${esc(t.name)} HDB resale prices</a>`).join('\n')}
  </div>` : '';

  const series = rollingPsfSeries(window12, recs, { ...likeForLike, level: cur.psf });
  const body = `${valueCardHtml({
    heading: `Typical condo resale price in District ${dn}`,
    prices: cur.inWin.map((r) => Number(r.price)),
    med: cur.med,
    psf: cur.psf,
    n: cur.n,
    yoy,
    latestFullMonth: generatedAt,
    scope: 'resale condos and apartments',
    series,
    mixNote: 'Weighted to the year’s mix of unit sizes and tenures, so a run of bigger or newer units selling does not show up as a price rise.',
  })}
  <h2>Median price by size (last 12 months)</h2>
  <div class="tbl"><table>
    <thead><tr><th>Size</th><th>Median price</th><th>Median $psf</th><th>Sales</th></tr></thead>
    <tbody>
${bandRows}
    </tbody>
  </table></div>${splitSection}${projectSection}
  <h2>Most recent transactions</h2>
  <div class="tbl"><table>
    <thead><tr><th>Month</th><th style="text-align:left">Project</th><th>Size</th><th>Floor</th><th>Price</th></tr></thead>
    <tbody>
${latest}
    </tbody>
  </table></div>${launchSection}${townSection}
  <h2>Nearby districts</h2>
  <div class="nearby">
${nearby}
  </div>
  <p class="src" style="margin-top:18px">Buying an HDB instead? See <a href="/hdb-prices/">HDB prices by town</a>. Check what a purchase really costs with the <a href="/stamp-duty-calculator/">stamp duty calculator</a> and <a href="/calculator/">affordability calculator</a>, or look terms up in the <a href="/glossary/">glossary</a>. Back to <a href="/condo-prices/">all districts</a>.</p>
${faqHtml(extraSchema[1], esc)}`;

  fs.mkdirSync(`${OUT}/d${d}`, { recursive: true });
  fs.writeFileSync(`${OUT}/d${d}/index.html`, pageShell({
    path: `/condo-prices/d${d}/`,
    titleTag: fitTitle(`District ${dn} Condo Resale Prices — ${esc(areaName.split(',')[0])} | PropertySG`, `D${dn} Condo Resale Prices — ${esc(areaName.split(',')[0])} | PropertySG`),
    desc: esc(districtDescription({ dn, area: areaName.split(',')[0], med: cur.med, psf: cur.psf, n: cur.n, hasProjects: projectList.length > 0 })),
    h1: `District ${dn} condo resale prices`,
    lede: `${areaName}. Every figure comes from caveats actually lodged with URA — no estimates, no modelling.`,
    body,
    breadcrumbName: `District ${dn}`,
    extraSchema,
    waMessage: `Hi Joe, I'm looking at District ${dn} (${areaName.split(',')[0]}) condos — can you share your read on the market?`,
  }));
  indexRows.push({ d, dn, areaName, med: cur.med, n: cur.n });
}

// ── Hub ──
const grid = indexRows
  .map((r) => `    <a class="town-card" href="/condo-prices/d${r.d}/"><span class="t">D${r.dn} · ${esc(r.areaName.split(',')[0])}</span><span class="m">${money(r.med)} median · ${r.n} sales</span></a>`)
  .join('\n');
const hubSchemaFaq = {
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Where does this condo price data come from?',
      acceptedAnswer: { '@type': 'Answer', text: "The Urban Redevelopment Authority's caveat records (PMI_Resi_Transaction), covering resale condominiums and apartments. Caveats are lodged on actual purchases, so every figure reflects a real transaction." },
    },
    {
      '@type': 'Question',
      name: 'Which district has the highest median condo resale price?',
      acceptedAnswer: { '@type': 'Answer', text: `${(() => { const top = [...indexRows].sort((a, b) => b.med - a.med)[0]; return `District ${top.dn} (${top.areaName.split(',')[0]}), with a 12-month median of ${money(top.med)}.`; })()}` },
    },
    {
      '@type': 'Question',
      name: 'Why is my district not listed?',
      acceptedAnswer: { '@type': 'Answer', text: `Districts with fewer than ${MIN_TX_12M} resale caveats in the last 12 months are left out — a median computed from a handful of sales would mislead more than it informs.` },
    },
  ],
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/index.html`, pageShell({
  path: '/condo-prices/',
  titleTag: 'Singapore Condo Resale Prices by District | PropertySG',
  desc: `Median condo resale prices for ${indexRows.length} Singapore districts from official URA caveats — by size, with recent transactions. Updated monthly.`,
  h1: 'Condo resale prices, district by district',
  lede: 'Pick your district for medians by size and the latest caveats lodged — straight from official URA data.',
  body: `  <div class="town-grid">\n${grid}\n  </div>\n${faqHtml(hubSchemaFaq, esc)}`,
  breadcrumbName: null,
  extraSchema: [hubSchemaFaq],
  waMessage: "Hi Joe, I'm comparing condo districts — can you help me shortlist?",
}));

// ── Sitemap managed block ──
let sm = fs.readFileSync('sitemap.xml', 'utf8');
sm = sm.replace(/  <!-- condo-prices:start -->[\s\S]*?<!-- condo-prices:end -->\n/g, '');
const entries = ['/condo-prices/', ...indexRows.map((r) => `/condo-prices/d${r.d}/`)]
  .map((p) => `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`)
  .join('\n');
sm = sm.replace('</urlset>', `  <!-- condo-prices:start -->\n${entries}\n  <!-- condo-prices:end -->\n</urlset>`);
fs.writeFileSync('sitemap.xml', sm);

console.log(`Generated ${indexRows.length} district pages + index; sitemap updated.`);
