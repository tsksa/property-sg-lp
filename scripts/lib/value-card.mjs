// Value card + 12-month trend chart for the /hdb-prices/<town>/ and
// /condo-prices/<dNN>/ pages (JOE-394, UI audit step 4).
//
// The pattern is Zillow's home-value card: one headline number, the range most
// sales fall in, the year-on-year change, $psf and the sample size, beside a
// small trend line. Everything is computed at build time from the same
// transactions the page's tables use, and the chart is inline SVG, so the page
// makes no extra requests and the card survives the monthly data refresh.
//
// Pure functions only — no fetches, no fs — so tests can drive them directly.

/** Minimum y-axis span as a share of the price level (see trendSvg). */
export const MIN_SPAN = 0.2;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 'YYYY-MM' → 'Sep 2025'. */
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** 'YYYY-MM' shifted by `delta` calendar months. */
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Linear-interpolated quantile (the same method as numpy's default). */
export function quantile(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function median(values) {
  return quantile(values, 0.5);
}

/**
 * Rolling median $psf, one point per month of the window.
 *
 * A single month's median swings with the mix of flats that happened to sell
 * (a month heavy in 5-room flats looks like a price jump), so each point pools
 * that month with the two before it. $psf rather than price for the same
 * reason: it is far less sensitive to the size mix than the median price.
 *
 * @param {string[]} window12  the page's 12 reporting months, any order
 * @param {Array} recs         the area's transactions (any span)
 * @param {(r) => string} monthOf  record → 'YYYY-MM'
 * @param {(r) => number} psfOf    record → $psf
 * @param {{span?: number, minN?: number}} opts  points with fewer than minN
 *   sales in their pooled months are left as gaps rather than drawn from noise
 */
export function rollingPsfSeries(window12, recs, monthOf, psfOf, { span = 3, minN = 5 } = {}) {
  const byMonth = new Map();
  for (const r of recs) {
    const m = monthOf(r);
    if (!m) continue;
    const v = psfOf(r);
    if (!Number.isFinite(v)) continue;
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(v);
  }
  return [...window12].sort().map((month) => {
    const pooled = [];
    for (let i = 0; i < span; i += 1) pooled.push(...(byMonth.get(shiftMonth(month, -i)) ?? []));
    return { month, n: pooled.length, psf: pooled.length >= minN ? median(pooled) : null };
  });
}

/** Round outward to a step that gives tidy axis labels. */
function niceStep(range) {
  const raw = range / 2;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/**
 * Inline SVG trend line. Returns '' when fewer than six months can be drawn —
 * a "trend" through three points says more about noise than the market.
 * Colours come from CSS classes so the chart follows the page theme.
 */
export function trendSvg(series, { idBase = 'vc' } = {}) {
  const pts = series.filter((p) => p.psf !== null);
  if (pts.length < 6) return '';

  const W = 320;
  const H = 150;
  const L = 46; // room for "$1,250"
  const R = 12;
  const T = 12;
  const B = 26;
  const values = pts.map((p) => p.psf);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Never let the axis span less than 20% of the price level. A tight
  // auto-fitted axis turns a 1% wobble into a cliff, which misleads a seller
  // more than any table could.
  const mid = (hi + lo) / 2;
  const span = Math.max(hi - lo, mid * MIN_SPAN);
  const step = niceStep(span);
  const yMin = Math.floor((mid - span / 2) / step) * step;
  const yMax = Math.max(Math.ceil((mid + span / 2) / step) * step, yMin + step);
  const n = series.length;
  const x = (i) => L + ((W - L - R) * i) / (n - 1);
  const y = (v) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));
  const r1 = (v) => Math.round(v * 10) / 10;

  // Break the line at gaps instead of drawing a straight bridge across them.
  const segments = [];
  let cur = [];
  series.forEach((p, i) => {
    if (p.psf === null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push([r1(x(i)), r1(y(p.psf))]);
    }
  });
  if (cur.length) segments.push(cur);
  const line = segments.map((seg) => 'M' + seg.map(([a, b]) => `${a} ${b}`).join(' L')).join(' ');
  const areas = segments
    .filter((seg) => seg.length > 1)
    .map((seg) => `<path class="vc-area" d="M${seg[0][0]} ${r1(y(yMin))} L${seg.map(([a, b]) => `${a} ${b}`).join(' L')} L${seg[seg.length - 1][0]} ${r1(y(yMin))} Z"/>`)
    .join('');

  const ticks = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);
  const grid = ticks
    .map((v) => `<line class="vc-grid" x1="${L}" x2="${W - R}" y1="${r1(y(v))}" y2="${r1(y(v))}"/><text class="vc-axis" x="${L - 6}" y="${r1(y(v) + 4)}" text-anchor="end">${money(v)}</text>`)
    .join('');

  const lastIdx = series.map((p) => p.psf !== null).lastIndexOf(true);
  const last = series[lastIdx];
  const first = series[0];
  const final = series[n - 1];

  return `<svg class="vc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${idBase}-t" preserveAspectRatio="xMidYMid meet">
      <title id="${idBase}-t">Median price per square foot by month, ${escHtml(monthLabel(first.month))} to ${escHtml(monthLabel(final.month))}, each point pooling that month with the two before it. Latest ${money(last.psf)} psf.</title>
      ${grid}
      ${areas}
      <path class="vc-line" d="${line}"/>
      <circle class="vc-dot" cx="${r1(x(lastIdx))}" cy="${r1(y(last.psf))}" r="4"/>
      <text class="vc-axis" x="${L}" y="${H - 6}" text-anchor="start">${escHtml(monthLabel(first.month))}</text>
      <text class="vc-axis" x="${W - R}" y="${H - 6}" text-anchor="end">${escHtml(monthLabel(final.month))}</text>
    </svg>`;
}

/** Change between the first and last drawn points, or null. */
export function seriesChange(series) {
  const pts = series.filter((p) => p.psf !== null);
  if (pts.length < 6) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return { from: a, to: b, pct: ((b.psf - a.psf) / a.psf) * 100 };
}

const pctText = (p) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`;

/**
 * The card itself.
 *
 * @param {object} o
 * @param {string} o.heading    e.g. "Typical HDB resale price in Bedok"
 * @param {number[]} o.prices   every sale price in the 12-month window
 * @param {number} o.med        12-month median price (the page's headline figure)
 * @param {number} o.psf        12-month median $psf
 * @param {number} o.n          sales in the window
 * @param {number|null} o.yoy   % change in median vs the prior 12 months
 * @param {string} o.latestFullMonth  'YYYY-MM'
 * @param {string} o.scope      e.g. "all flat types"
 * @param {Array} o.series      from rollingPsfSeries()
 */
export function valueCardHtml({ heading, prices, med, psf, n, yoy, latestFullMonth, scope, series }) {
  const p25 = quantile(prices, 0.25);
  const p75 = quantile(prices, 0.75);
  // Round the range to the nearest $1,000: the quartiles are interpolated, and
  // "$512,437" would claim a precision the method does not have.
  const k = (v) => money(Math.round(v / 1000) * 1000);
  const svg = trendSvg(series);
  const change = seriesChange(series);
  const yoyHtml = yoy === null
    ? '<dd>—</dd>'
    : `<dd class="${yoy < 0 ? 'down' : 'up'}">${pctText(yoy)}</dd>`;
  const trendLine = change
    ? `<p class="vc-trend">${change.pct >= 0 ? 'Up' : 'Down'} ${Math.abs(change.pct).toFixed(1)}% from ${money(change.from.psf)} psf in ${monthLabel(change.from.month)} to ${money(change.to.psf)} psf in ${monthLabel(change.to.month)}.</p>`
    : '';

  return `  <section class="vc" data-jt-value-card aria-labelledby="vc-h">
    <div class="vc-main">
      <h2 class="vc-k" id="vc-h">${escHtml(heading)}</h2>
      <p class="vc-v" data-vc-median>${money(med)}</p>
      <p class="vc-range">Half of all sales fell between <strong>${k(p25)}</strong> and <strong>${k(p75)}</strong></p>
      <dl class="vc-facts">
        <div><dt>Year on year</dt>${yoyHtml}</div>
        <div><dt>Median $psf</dt><dd>${money(psf)}</dd></div>
        <div><dt>Sales</dt><dd>${n.toLocaleString('en-SG')}</dd></div>
      </dl>
      <p class="vc-note">Median of ${n.toLocaleString('en-SG')} sales in the 12 months to ${monthLabel(latestFullMonth)}, ${escHtml(scope)}.</p>
    </div>${svg ? `
    <figure class="vc-chart">
      <figcaption><span class="vc-ck">Price per sq ft</span><span class="vc-cs">3-month rolling median</span></figcaption>
      ${svg}
      ${trendLine}
    </figure>` : ''}
  </section>`;
}

export const VALUE_CARD_CSS = `
.vc{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:28px;align-items:start;background:#fff;border:1px solid rgba(11,30,63,0.1);border-radius:18px;padding:26px 28px;margin:26px 0 34px;box-shadow:0 1px 2px rgba(11,30,63,0.04),0 8px 28px rgba(11,30,63,0.06)}
.vc-main{min-width:0}
.vc .vc-k{font-family:'DM Sans',sans-serif;font-size:0.74rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5f6b7a;margin:0}
.vc-v{font-family:'Fraunces',Georgia,serif;font-size:clamp(2.3rem,6vw,3.1rem);font-weight:700;letter-spacing:-1px;line-height:1.05;color:var(--navy);margin:8px 0 6px;font-variant-numeric:tabular-nums}
.vc-range{color:#3d4756;font-size:0.95rem}
.vc-range strong{color:var(--navy);font-variant-numeric:tabular-nums}
.vc-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0 12px;padding-top:16px;border-top:1px solid rgba(11,30,63,0.08)}
.vc-facts dt{font-size:0.7rem;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#6b6b6b}
.vc-facts dd{font-family:'Fraunces',Georgia,serif;font-size:1.25rem;font-weight:700;color:var(--navy);margin-top:2px;font-variant-numeric:tabular-nums}
.vc-facts dd.up{color:var(--emerald-dark)}.vc-facts dd.down{color:#b45309}
.vc-note{font-size:0.78rem;color:#6b6b6b}
.vc-chart{margin:0;min-width:0}
.vc-chart figcaption{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline;margin-bottom:6px}
.vc-ck{font-size:0.74rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5f6b7a}
.vc-cs{font-size:0.78rem;color:#6b6b6b}
.vc-svg{display:block;width:100%;height:auto;max-width:100%;overflow:visible}
.vc-svg .vc-grid{stroke:rgba(11,30,63,0.09);stroke-width:1}
.vc-svg .vc-axis{fill:#6b6b6b;font-family:'DM Sans',sans-serif;font-size:10.5px;font-variant-numeric:tabular-nums}
.vc-svg .vc-line{fill:none;stroke:#047857;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.vc-svg .vc-area{fill:rgba(16,185,129,0.1);stroke:none}
.vc-svg .vc-dot{fill:#047857;stroke:#fff;stroke-width:2}
.vc-trend{font-size:0.85rem;color:#3d4756;margin-top:6px}
@media(max-width:760px){.vc{grid-template-columns:1fr;gap:22px;padding:22px 18px}}
@media(max-width:420px){.vc-facts{gap:8px}.vc-facts dd{font-size:1.1rem}.vc-facts dt{font-size:0.64rem;letter-spacing:0.4px}}
html.jt-theme-dark .vc{background:#102447;border-color:rgba(255,255,255,.12);box-shadow:none}
html.jt-theme-dark :is(.vc-v,.vc-range strong,.vc-facts dd){color:#f8fafc}
html.jt-theme-dark .vc-facts dd.up{color:#34d399}html.jt-theme-dark .vc-facts dd.down{color:#fbbf24}
html.jt-theme-dark :is(.vc .vc-k,.vc-ck,.vc-facts dt,.vc-note,.vc-cs,.vc-range,.vc-trend){color:#c1cad8}
html.jt-theme-dark .vc-facts{border-top-color:rgba(255,255,255,.12)}
html.jt-theme-dark .vc-svg .vc-grid{stroke:rgba(255,255,255,.12)}
html.jt-theme-dark .vc-svg .vc-axis{fill:#c1cad8}
html.jt-theme-dark .vc-svg .vc-line{stroke:#34d399}
html.jt-theme-dark .vc-svg .vc-area{fill:rgba(52,211,153,0.14)}
html.jt-theme-dark .vc-svg .vc-dot{fill:#34d399;stroke:#102447}
`;
