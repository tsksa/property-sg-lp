#!/usr/bin/env node
// Generates /hdb-prices/<town>/ market pages + the /hdb-prices/ index from the
// official HDB Resale Flat Prices dataset on data.gov.sg (Open Data Licence).
//
// Run: node scripts/generate-estate-pages.mjs
// Refreshed monthly by .github/workflows/refresh-estate-pages.yml (opens a PR).
//
// Pages are generated to comply with scripts/check-consistency.mjs invariants.

import fs from 'node:fs';
import path from 'node:path';

const DATASET = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const API = 'https://data.gov.sg/api/action/datastore_search';
const OUT = 'hdb-prices';
const SITE = 'https://joetay.com';
const MONTHS_FETCHED = 25; // 12m window + 12m prior window for YoY + current partial

const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const title = (t) => t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function monthsBack(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

async function fetchMonth(month) {
  const filters = encodeURIComponent(JSON.stringify({ month }));
  const url = `${API}?resource_id=${DATASET}&filters=${filters}&limit=5000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.gov.sg ${res.status} for ${month}`);
  const j = await res.json();
  if (!j.success) throw new Error(`API failure for ${month}`);
  return j.result.records;
}

console.log(`Fetching ${MONTHS_FETCHED} months from data.gov.sg…`);
const months = monthsBack(MONTHS_FETCHED);
const all = [];
for (const m of months) {
  const recs = await fetchMonth(m);
  all.push(...recs);
  process.stdout.write(`  ${m}: ${recs.length}\n`);
}
if (all.length < 5000) throw new Error(`suspiciously few records (${all.length}) — aborting rather than generating empty pages`);

const latestFullMonth = months.find((m) => all.some((r) => r.month === m));
const window12 = months.slice(0, 12);
const prior12 = months.slice(12, 24);
const SQM_TO_SQFT = 10.7639;

const byTown = new Map();
for (const r of all) {
  if (!byTown.has(r.town)) byTown.set(r.town, []);
  byTown.get(r.town).push(r);
}

const generatedAt = latestFullMonth; // data currency, not wall clock
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

function pageShell({ path: pagePath, titleTag, desc, h1, lede, body, breadcrumbName }) {
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap"></noscript>
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: titleTag,
  url: canonical,
  description: desc,
  inLanguage: 'en-SG',
  isPartOf: { '@type': 'WebSite', name: 'PropertySG', url: SITE + '/' },
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
<script>try{if(localStorage.getItem('pdpa_consent')==='declined'){window['ga-disable-GT-KVFDZD5V']=true;window._pdpaDeclined=true;}}catch(e){}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=GT-KVFDZD5V"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','GT-KVFDZD5V');</script>
<style>
.skip-link{position:absolute;left:-9999px;top:0;z-index:10050;background:#0b1e3f;color:#fff;padding:12px 20px;border-radius:0 0 10px 0;font-weight:700;font-size:0.9rem;text-decoration:none}.skip-link:focus{left:0;outline:2px solid #10b981;outline-offset:2px}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--navy:#0b1e3f;--navy-2:#061430;--emerald:#10b981;--emerald-dark:#059669;--cream:#faf6ec}
body{font-family:'DM Sans',sans-serif;color:#1a1a1a;background:#fdfbf6;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--emerald);text-decoration:none}a:hover{text-decoration:underline}
.topbar{background:linear-gradient(135deg,var(--navy),var(--navy-2));color:#fff;padding:20px 24px}
.topbar-inner{max-width:1000px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:14px}
.logo{font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:1.15rem;color:#fff;display:flex;align-items:center;gap:8px}
.logo::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--emerald);box-shadow:0 0 0 3px rgba(16,185,129,0.18)}
.topbar a.back{color:rgba(255,255,255,0.85);font-size:0.88rem}
main{max-width:1000px;margin:0 auto;padding:40px 24px 72px}
.eyebrow{display:inline-block;font-size:0.72rem;font-weight:700;color:var(--emerald);letter-spacing:2px;text-transform:uppercase;padding:6px 14px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:100px;margin-bottom:16px}
h1{font-family:'Fraunces',Georgia,serif;font-size:clamp(1.8rem,4.5vw,2.6rem);font-weight:700;letter-spacing:-0.8px;line-height:1.12;color:var(--navy);margin-bottom:12px}
.lede{color:#555;max-width:640px;margin-bottom:8px}
.src{font-size:0.78rem;color:#767676;margin-bottom:30px}
.stat-band{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:26px 0 34px}
.stat{background:#fff;border:1px solid rgba(11,30,63,0.08);border-radius:14px;padding:18px}
.stat .k{font-size:0.7rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#767676}
.stat .v{font-family:'Fraunces',Georgia,serif;font-size:1.5rem;font-weight:700;color:var(--navy);margin-top:4px}
.stat .d{font-size:0.75rem;color:#767676;margin-top:2px}
.up{color:var(--emerald-dark)}.down{color:#b45309}
h2{font-family:'Fraunces',Georgia,serif;font-size:1.35rem;color:var(--navy);letter-spacing:-0.3px;margin:34px 0 14px}
.tbl{overflow-x:auto;background:#fff;border:1px solid rgba(11,30,63,0.08);border-radius:14px}
table{width:100%;border-collapse:collapse;font-size:0.88rem;min-width:520px}
th{font-size:0.7rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#767676;text-align:left;padding:12px 16px;border-bottom:1px solid rgba(11,30,63,0.08)}
td{padding:11px 16px;border-bottom:1px solid rgba(11,30,63,0.05)}
tr:last-child td{border-bottom:none}
td:nth-child(n+2),th:nth-child(n+2){text-align:right}
.town-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.town-card{background:#fff;border:1px solid rgba(11,30,63,0.08);border-radius:12px;padding:16px 18px;display:block;color:inherit}
.town-card:hover{border-color:rgba(16,185,129,0.4);text-decoration:none}
.town-card .t{font-weight:700;color:var(--navy)}
.town-card .m{font-size:0.82rem;color:#767676;margin-top:3px}
.cta{background:linear-gradient(135deg,var(--navy),var(--navy-2));border-radius:16px;color:#fff;padding:28px;margin-top:40px}
.cta h2{color:#fff;margin:0 0 8px}
.cta p{color:rgba(255,255,255,0.85);max-width:560px;margin-bottom:16px}
.cta .btns{display:flex;gap:10px;flex-wrap:wrap}
.cta a.primary{background:var(--emerald);color:#fff;font-weight:700;padding:12px 22px;border-radius:10px}
.cta a.secondary{border:1px solid rgba(255,255,255,0.35);color:#fff;font-weight:600;padding:12px 22px;border-radius:10px}
footer{max-width:1000px;margin:0 auto;padding:0 24px 40px;font-size:0.78rem;color:#767676}
a:focus-visible{outline:2px solid var(--emerald);outline-offset:3px;border-radius:4px}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar">
  <div class="topbar-inner">
    <a href="/" class="logo">PropertySG</a>
    <a href="/" class="back">← Back to home</a>
  </div>
</header>
<main id="main" tabindex="-1">
  <div class="eyebrow">Official HDB data · Updated monthly</div>
  <h1>${h1}</h1>
  <p class="lede">${lede}</p>
  <p class="src">Source: HDB Resale Flat Prices via data.gov.sg · latest full month ${generatedAt} · figures below use the last 12 months unless stated.</p>
${body}
  <div class="cta">
    <h2>What would <em>your</em> flat fetch?</h2>
    <p>The medians above are town-wide. Your block, storey, and renovation state move the number — check the actual sales in your block, or get a considered valuation from me on WhatsApp within 24 hours.</p>
    <div class="btns">
      <a class="primary" href="/neighbour-prices/">Check your block's sold prices</a>
      <a class="secondary" href="/valuation.html">Get a free valuation</a>
    </div>
  </div>
</main>
<footer>
  <p>Contains information from the <a href="https://data.gov.sg/datasets/${DATASET}/view" target="_blank" rel="noopener">HDB Resale Flat Prices</a> dataset accessed via data.gov.sg, made available under the <a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noopener">Singapore Open Data Licence v1.0</a>. Medians are indicative, not a valuation. PropertySG · Joe Tay, District Director, ERA · CEA R009618D.</p>
</footer>
</body>
</html>
`;
}

// ── Town pages ──
const indexRows = [];
for (const town of towns) {
  const recs = byTown.get(town);
  const cur = stats(recs, window12);
  const prev = stats(recs, prior12);
  if (cur.n < 20) { console.log(`  skip ${town} (only ${cur.n} tx in 12m)`); continue; }
  const t = title(town);
  const s = slug(town);
  const yoy = prev.med ? ((cur.med - prev.med) / prev.med) * 100 : null;

  // per-flat-type table (12m)
  const types = ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
  const typeRows = types.map((ft) => {
    const tx = cur.inWin.filter((r) => r.flat_type === ft);
    if (tx.length < 5) return null;
    const p = median(tx.map((r) => Number(r.resale_price)));
    const area = median(tx.map((r) => Number(r.floor_area_sqm)));
    return `<tr><td>${title(ft)}</td><td>${money(p)}</td><td>${Math.round(area)} sqm</td><td>${tx.length}</td></tr>`;
  }).filter(Boolean).join('\n      ');

  const latest = recs
    .filter((r) => r.month === months[0] || r.month === months[1])
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12)
    .map((r) => `<tr><td>${r.month}</td><td style="text-align:left">${esc(title(r.flat_type))} · Blk ${esc(r.block)} ${esc(title(r.street_name))}</td><td>${esc(r.storey_range)}</td><td>${money(Number(r.resale_price))}</td></tr>`)
    .join('\n      ');

  const desc = `${t} HDB resale prices from official data: 12-month median ${money(cur.med)} across ${cur.n} sales, median ${'$' + Math.round(cur.psf)} psf. Updated monthly.`.slice(0, 158);

  const body = `  <div class="stat-band">
    <div class="stat"><div class="k">12-month median</div><div class="v">${money(cur.med)}</div><div class="d">${cur.n} transactions</div></div>
    <div class="stat"><div class="k">Median $psf</div><div class="v">$${Math.round(cur.psf)}</div><div class="d">all flat types</div></div>
    <div class="stat"><div class="k">Vs prior 12 months</div><div class="v ${yoy >= 0 ? 'up' : 'down'}">${yoy === null ? '—' : (yoy >= 0 ? '+' : '') + yoy.toFixed(1) + '%'}</div><div class="d">median price change</div></div>
  </div>
  <h2>Median price by flat type (last 12 months)</h2>
  <div class="tbl"><table>
    <thead><tr><th>Flat type</th><th>Median price</th><th>Median size</th><th>Sales</th></tr></thead>
    <tbody>
      ${typeRows}
    </tbody>
  </table></div>
  <h2>Most recent transactions</h2>
  <div class="tbl"><table>
    <thead><tr><th>Month</th><th style="text-align:left">Flat</th><th>Storey</th><th>Price</th></tr></thead>
    <tbody>
      ${latest}
    </tbody>
  </table></div>`;

  fs.mkdirSync(path.join(OUT, s), { recursive: true });
  fs.writeFileSync(path.join(OUT, s, 'index.html'), pageShell({
    path: `/hdb-prices/${s}/`,
    titleTag: `${t} HDB Resale Prices — Median &amp; Recent Sales | PropertySG`,
    desc: esc(desc),
    h1: `${t} HDB resale prices`,
    lede: `Every figure on this page comes from actual registered resale transactions in ${t} — no estimates, no modelling.`,
    body,
    breadcrumbName: t,
  }));
  indexRows.push({ town: t, s, med: cur.med, n: cur.n });
}

// ── Index page ──
const grid = indexRows.map((r) => `    <a class="town-card" href="/hdb-prices/${r.s}/"><span class="t">${r.town}</span><span class="m" style="display:block">median ${money(r.med)} · ${r.n} sales/12m</span></a>`).join('\n');
fs.writeFileSync(path.join(OUT, 'index.html'), pageShell({
  path: '/hdb-prices/',
  titleTag: 'HDB Resale Prices by Town — Official Medians, Updated Monthly | PropertySG',
  desc: `Median HDB resale prices for all ${indexRows.length} towns from official transaction data — by flat type, with recent sales. Updated monthly from data.gov.sg.`,
  h1: 'HDB resale prices, town by town',
  lede: 'Pick your town for medians by flat type and the latest registered transactions — straight from official HDB data.',
  body: `  <div class="town-grid">\n${grid}\n  </div>`,
  breadcrumbName: null,
}));

// ── Sitemap upkeep (managed block) ──
let sm = fs.readFileSync('sitemap.xml', 'utf8');
sm = sm.replace(/  <!-- hdb-prices:start -->[\s\S]*?<!-- hdb-prices:end -->\n/g, '');
const today = `${generatedAt}-01`.slice(0, 10);
const entries = ['/hdb-prices/', ...indexRows.map((r) => `/hdb-prices/${r.s}/`)]
  .map((p) => `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`)
  .join('\n');
sm = sm.replace('</urlset>', `  <!-- hdb-prices:start -->\n${entries}\n  <!-- hdb-prices:end -->\n</urlset>`);
fs.writeFileSync('sitemap.xml', sm);

console.log(`Generated ${indexRows.length} town pages + index; sitemap updated.`);
