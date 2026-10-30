// Detail sections for the /hdb-prices/<town>/ pages (JOE-469 WS1).
//
// 43% of the town pages' Search Console impressions were flat-type queries
// ("tampines 3 room resale flat price"), and about a quarter were "<town> hdb
// for sale", "<town> maisonette" or block and street queries. The template
// answered none of them: no flat-type headings, the word "maisonette" never
// appeared and blocks were not listed. Every figure here is counted from the
// same data.gov.sg rows as the rest of the page — no estimates.
//
// Each section is wrapped in <section data-est="…"> so a test can hold the
// added weight to its budget (see tests/estate-schema.test.mjs).

import { quantile, monthLabel } from './value-card.mjs';
import { titleCase } from './estate-schema.mjs';

const SQM_TO_SQFT = 10.7639;
const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
// Quartiles are interpolated; "$512,437" would claim a precision the method does not have.
const k1000 = (v) => money(Math.round(v / 1000) * 1000);
const median = (a) => quantile(a, 0.5);
const priceOf = (r) => Number(r.resale_price);
const psfOf = (r) => Number(r.resale_price) / (Number(r.floor_area_sqm) * SQM_TO_SQFT);
const storeys = (s) => s.toLowerCase().replace(/\b0(\d)/g, '$1'); // "07 TO 09" -> "7 to 9"

// Bytes the detail sections together may add to a town page. With the
// per-type FAQ answers this keeps each page within about 25KB of its size
// before JOE-469; the generator thins the block index to fit.
export const DETAIL_BUDGET = 19 * 1024;

export const FLAT_TYPES = ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
// A flat type gets its own section, FAQ and hub cell only with this many sales.
export const MIN_TYPE_SALES = 10;

/** '4 ROOM' -> '4-room', 'EXECUTIVE' -> 'Executive'. */
export function typeLabel(ft) {
  const m = ft.match(/^(\d) ROOM$/);
  return m ? `${m[1]}-room` : titleCase(ft);
}
/** Anchor id: '4-room', 'executive'. */
export const typeId = (ft) => typeLabel(ft).toLowerCase();
const article = (label) => (/^[aeiou]/i.test(label) ? 'an' : 'a');

/** Remaining lease in whole years from "61 years 04 months"; null if absent. */
export function remainingYears(r) {
  const y = parseInt(r.remaining_lease, 10);
  return Number.isFinite(y) ? y : null;
}

export const LEASE_BANDS = [
  { label: 'Under 60 years', test: (y) => y < 60 },
  { label: '60 to 79 years', test: (y) => y >= 60 && y < 80 },
  { label: '80 years or more', test: (y) => y >= 80 },
];

/** Share of sales with under 60 and with 80+ years of lease left. */
export function leaseProfile(inWin) {
  const years = inWin.map(remainingYears).filter((y) => y !== null);
  if (!years.length) return { under60: 0, over80: 0 };
  return {
    under60: years.filter((y) => y < 60).length / years.length,
    over80: years.filter((y) => y >= 80).length / years.length,
  };
}

/**
 * Per-flat-type figures from the 12-month rows, for the sections, the FAQ,
 * the description and the hub table. Only types with MIN_TYPE_SALES or more.
 */
export function typeStats(inWin) {
  return FLAT_TYPES.map((ft) => {
    const tx = inWin.filter((r) => r.flat_type === ft && Number.isFinite(priceOf(r)));
    if (tx.length < MIN_TYPE_SALES) return null;
    const prices = tx.map(priceOf);
    const byPrice = [...tx].sort((a, b) => priceOf(a) - priceOf(b) || a.month.localeCompare(b.month));
    return {
      ft,
      label: typeLabel(ft),
      id: typeId(ft),
      n: tx.length,
      med: median(prices),
      p25: quantile(prices, 0.25),
      p75: quantile(prices, 0.75),
      sqm: median(tx.map((r) => Number(r.floor_area_sqm))),
      psf: median(tx.map(psfOf).filter(Number.isFinite)),
      lowest: byPrice[0],
      highest: byPrice[byPrice.length - 1],
      tx,
    };
  }).filter(Boolean);
}

const saleText = (r) => `${money(priceOf(r))} at Blk ${r.block} ${titleCase(r.street_name)}, storeys ${storeys(r.storey_range)}, ${monthLabel(r.month)}`;

function leaseTable(tx) {
  const rows = LEASE_BANDS.map((band) => {
    const inBand = tx.filter((r) => {
      const y = remainingYears(r);
      return y !== null && band.test(y);
    });
    return { band, n: inBand.length, med: inBand.length >= 5 ? median(inBand.map(priceOf)) : null };
  }).filter((row) => row.n);
  if (rows.filter((row) => row.med !== null).length < 2) return '';
  return `
  <div class="tbl"><table class="mini">
    <thead><tr><th>Lease left at sale</th><th>Median price</th><th>Sales</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr><td>${row.band.label}</td><td>${row.med === null ? '–' : money(row.med)}</td><td>${row.n}</td></tr>`).join('\n      ')}
    </tbody>
  </table></div>`;
}

/**
 * One section per flat type with MIN_TYPE_SALES sales, headed the way people
 * search ("How much is a 4-room HDB resale flat in Yishun?").
 */
export function flatTypeSections({ t, types, window12, esc, recent = 3 }) {
  const span = `${monthLabel(window12[window12.length - 1])}–${monthLabel(window12[0])}`;
  return types.map((s) => {
    const latest = [...s.tx]
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, recent)
      .map((r) => `<tr><td>${r.month}</td><td class="l">Blk ${esc(r.block)} ${esc(titleCase(r.street_name))}</td><td>${esc(storeys(r.storey_range))}</td><td>${money(priceOf(r))}</td></tr>`)
      .join('\n      ');
    return `  <section data-est="type" id="${s.id}">
  <h2>How much is ${article(s.label)} ${s.label} HDB resale flat in ${esc(t)}?</h2>
  <p>${article(s.label) === 'an' ? 'An' : 'A'} ${s.label} resale flat in ${esc(t)} sold for a median <strong>${money(s.med)}</strong> (${Math.round(s.sqm)} sqm, ${s.n.toLocaleString('en-SG')} sales, ${span}). Half sold between ${k1000(s.p25)} and ${k1000(s.p75)}; the median was $${Math.round(s.psf)} psf.</p>
  <p class="src">Lowest: ${esc(saleText(s.lowest))}. Highest: ${esc(saleText(s.highest))}.</p>${leaseTable(s.tx)}
  <div class="tbl"><table class="mini">
    <thead><tr><th>Month</th><th class="l">Recent sale</th><th>Storey</th><th>Price</th></tr></thead>
    <tbody>
      ${latest}
    </tbody>
  </table></div>
  </section>`;
  }).join('\n');
}

// Flat models people search for by name. 'Adjoined flat' is the dataset's
// name for a jumbo flat (two flats joined).
const SPECIAL_MODELS = [
  ['Maisonette', 'Maisonette'],
  ['Model A-Maisonette', 'Model A maisonette'],
  ['Improved-Maisonette', 'Improved maisonette'],
  ['Premium Maisonette', 'Premium maisonette'],
  ['Executive Maisonette', 'Executive maisonette'],
  ['Adjoined flat', 'Jumbo (adjoined) flat'],
  ['DBSS', 'DBSS'],
  ['Premium Apartment Loft', 'Premium Apartment Loft'],
  ['Multi Generation', 'Multi-Generation'],
  ['3Gen', '3Gen'],
  ['Terrace', 'Terrace'],
];
export const MIN_MODEL_SALES = 5;

/** Maisonettes, jumbo flats and other named models with MIN_MODEL_SALES sales; '' if none. */
export function flatModelBlock({ t, inWin, esc }) {
  const rows = SPECIAL_MODELS.map(([model, label]) => {
    const tx = inWin.filter((r) => r.flat_model === model);
    return { model, label, tx };
  }).filter((row) => row.tx.length >= MIN_MODEL_SALES);
  if (!rows.length) return '';
  const hasMaisonette = rows.some((row) => /maisonette/i.test(row.model));
  const hasJumbo = rows.some((row) => row.model === 'Adjoined flat');
  const others = rows.some((row) => !/maisonette/i.test(row.model) && row.model !== 'Adjoined flat');
  const parts = [hasMaisonette && 'Maisonettes', hasJumbo && 'jumbo flats', others && 'other flat models'].filter(Boolean);
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const heading = joined[0].toUpperCase() + joined.slice(1);
  return `  <section data-est="models" id="maisonettes">
  <h2>${heading} in ${esc(t)}</h2>
  <p class="src">Flat models with at least ${MIN_MODEL_SALES} resale sales in the last 12 months, from the dataset's flat model field. The dataset records most maisonettes as Executive flats.</p>
  <div class="tbl"><table class="mini">
    <thead><tr><th>Flat model</th><th>Median price</th><th>Median size</th><th>Sales</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr><td>${row.label}</td><td>${money(median(row.tx.map(priceOf)))}</td><td>${Math.round(median(row.tx.map((r) => Number(r.floor_area_sqm))))} sqm</td><td>${row.tx.length}</td></tr>`).join('\n      ')}
    </tbody>
  </table></div>
  </section>`;
}

/**
 * Blocks grouped by street, each street collapsed. Only blocks with at least
 * `minSales` sales; the generator raises that threshold until the block fits
 * its byte budget, so a town with 500 traded blocks does not double the page.
 * /neighbour-prices/ prefills only from ?postal= (the resale rows carry no
 * postal code), so the section ends in one lookup link, not one per street.
 */
export function blockIndex({ t, inWin, latestFullMonth, esc, minSales = 2 }) {
  const byBlock = new Map();
  for (const r of inWin) {
    const key = `${r.street_name}|${r.block}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(r);
  }
  const byStreet = new Map();
  for (const tx of byBlock.values()) {
    if (tx.length < minSales) continue;
    const street = tx[0].street_name;
    if (!byStreet.has(street)) byStreet.set(street, []);
    byStreet.get(street).push(tx);
  }
  if (!byStreet.size) return { html: '', blocks: 0 };
  const seenIds = new Set();
  let blocks = 0;
  const streets = [...byStreet.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))
    .map(([street, list]) => {
      list.sort((a, b) => a[0].block.localeCompare(b[0].block, 'en', { numeric: true }));
      const sales = list.reduce((sum, tx) => sum + tx.length, 0);
      const rows = list.map((tx) => {
        blocks += 1;
        const last = [...tx].sort((a, b) => b.month.localeCompare(a.month) || priceOf(b) - priceOf(a))[0];
        let id = `blk-${tx[0].block.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
        if (seenIds.has(id)) id += `-${street.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        seenIds.add(id);
        const latest = `${monthLabel(last.month)} · ${typeLabel(last.flat_type)} · ${storeys(last.storey_range)} · ${money(priceOf(last))}`;
        return `<tr id="${id}"><td>${esc(tx[0].block)}</td><td>${esc(tx[0].lease_commence_date)}</td><td>${tx.length}</td><td>${esc(latest)}</td><td>$${Math.round(median(tx.map(psfOf).filter(Number.isFinite)))}</td></tr>`;
      }).join('\n');
      const name = esc(titleCase(street));
      return `<details class="blk"><summary>${name} · ${list.length} ${list.length === 1 ? 'block' : 'blocks'}, ${sales} sales</summary>
<div class="tbl"><table class="mini"><thead><tr><th>Blk</th><th>Lease from</th><th>Sales</th><th>Latest sale</th><th>$psf</th></tr></thead><tbody>
${rows}
</tbody></table></div></details>`;
    });
  const html = `  <section data-est="blocks" id="blocks">
  <h2>${esc(t)} HDB resale prices by block</h2>
  <p class="src">Every ${esc(t)} block with at least ${minSales} resale sales in the 12 months to ${monthLabel(latestFullMonth)} (${blocks} blocks), grouped by street. Tap a street to see its blocks.</p>
${streets.join('\n')}
  <p class="src"><a href="/neighbour-prices/">Look up every sale in your block</a></p>
  </section>`;
  return { html, blocks };
}

/** "Looking at HDB flats for sale in <town>?": sold prices, not listings. */
export function buyerSection({ t, esc }) {
  const wa = encodeURIComponent(`Hi Joe, I'm looking at an HDB flat for sale in ${t}. Can you help me compare the asking price with recent sales?`);
  const town = esc(t);
  return `  <section data-est="buyer" id="for-sale">
  <h2>Looking at HDB flats for sale in ${town}?</h2>
  <p>This page shows registered sold prices, not live listings. If you have found ${article(t)} ${town} flat for sale, compare its asking price with the sales above for the same flat type, lease band and street.</p>
  <p><a class="est-wa" href="https://wa.me/6581881488?text=${wa}" target="_blank" rel="noopener" data-cta="whatsapp-estate" onclick="if(typeof gtag==='function')gtag('event','whatsapp_cta_click',{cta_location:'estate-buyer',town:'${town}'});">Ask me to check an asking price on WhatsApp →</a></p>
  </section>`;
}

// data.gov.sg "Renting Out of Flats from Jan 2021" (HDB). Its flat types are
// spelt "4-ROOM", and the resale dataset's CENTRAL AREA is just CENTRAL there.
export const RENT_DATASET = 'd_c9f57187485a850908655db0e8cfe651';
export const rentTown = (town) => (town === 'CENTRAL' ? 'CENTRAL AREA' : town);
export const rentFlatType = (ft) => ft.replace(/^(\d)-ROOM$/, '$1 ROOM');
export const MIN_RENT_APPROVALS = 10;

/**
 * Median monthly rent by flat type with MIN_RENT_APPROVALS approvals; '' if
 * no flat type qualifies. Gross yield only where the same flat type also has
 * a resale median on this page.
 */
export function rentalSection({ t, rents, rentMonths, types, esc }) {
  if (!rents?.length || !rentMonths?.length) return '';
  const sorted = [...rentMonths].sort();
  const rows = FLAT_TYPES.map((ft) => {
    const tx = rents.filter((r) => rentFlatType(r.flat_type) === ft).map((r) => Number(r.monthly_rent)).filter(Number.isFinite);
    if (tx.length < MIN_RENT_APPROVALS) return null;
    const rent = median(tx);
    const resale = types.find((s) => s.ft === ft);
    const yieldPct = resale ? ((rent * 12) / resale.med) * 100 : null;
    return `<tr><td>${typeLabel(ft)}</td><td>${money(rent)}</td><td>${tx.length}</td><td>${yieldPct === null ? '–' : `${yieldPct.toFixed(1)}%`}</td></tr>`;
  }).filter(Boolean);
  if (!rows.length) return '';
  const town = esc(t);
  return `  <section data-est="rent" id="rent">
  <h2>${town} HDB rental prices</h2>
  <p>Median monthly rent for ${town} flats approved for renting out by HDB, ${monthLabel(sorted[0])} to ${monthLabel(sorted[sorted.length - 1])}.</p>
  <div class="tbl"><table class="mini">
    <thead><tr><th>Flat type</th><th>Median rent</th><th>Approvals</th><th>Indicative gross yield</th></tr></thead>
    <tbody>
      ${rows.join('\n      ')}
    </tbody>
  </table></div>
  <p class="src">Contains information from HDB's <a href="https://data.gov.sg/datasets/${RENT_DATASET}/view" target="_blank" rel="noopener">Renting Out of Flats</a> dataset accessed via data.gov.sg, made available under the <a href="https://data.gov.sg/open-data-licence" target="_blank" rel="noopener">Singapore Open Data Licence v1.0</a>. Rents are declared by owners and HDB does not verify them. Indicative gross yield is the median rent × 12 ÷ the 12-month median resale price for the same flat type, before costs, tax and vacant months; flat types with under ${MIN_RENT_APPROVALS} approvals are left out.</p>
  <p><strong>Thinking of renting out your ${town} flat?</strong> <a href="/rent-out/">How I help HDB landlords rent out →</a></p>
  </section>`;
}

/**
 * Meta description led by per-type medians, e.g. "Yishun HDB resale prices:
 * 3-room $433k, 4-room $550k, 5-room $690k median (1,575 sales, 12 months to
 * Sep 2026). Sold prices by street and block." Always ≤ max and ends in '.'.
 */
export function townDescription({ t, types, n, latestFullMonth, max = 158 }) {
  const k = (v) => (v >= 995000 ? `$${(v / 1e6).toFixed(2)}m` : `$${Math.round(v / 1000)}k`);
  const preferred = ['3 ROOM', '4 ROOM', '5 ROOM'];
  const picked = [
    ...types.filter((s) => preferred.includes(s.ft)),
    ...types.filter((s) => !preferred.includes(s.ft)),
  ].slice(0, 3).sort((a, b) => FLAT_TYPES.indexOf(a.ft) - FLAT_TYPES.indexOf(b.ft));
  const tail = ` (${n.toLocaleString('en-SG')} sales, 12 months to ${monthLabel(latestFullMonth)}).`;
  const candidates = [];
  for (let count = picked.length; count >= 1; count -= 1) {
    const lead = `${t} HDB resale prices: ${picked.slice(0, count).map((s) => `${s.label} ${k(s.med)}`).join(', ')} median${tail}`;
    candidates.push(`${lead} Sold prices by street and block.`, lead);
  }
  candidates.push(`${t} HDB resale prices by flat type, street and block${tail}`);
  return candidates.find((c) => c.length <= max) || `${t} HDB resale prices by flat type.`;
}
