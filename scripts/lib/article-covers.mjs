// Opening images and share previews for the insights articles (JOE-398, UI
// audit step 5).
//
// Each article gets a 1200×630 cover built from insights/article-covers.json:
// its own headline figures, or for the town-by-town data articles a bar chart
// read straight out of the article's table. Covers are rendered once by
// scripts/build-article-covers.mjs and placed on the pages by
// scripts/apply-article-cover.mjs.
//
// Honesty rule: a cover may only repeat what its article already says. Every
// figure value and every chart label and value is checked word for word
// against the article text (validateCover), and the build refuses otherwise.
//
// Pure functions apart from loadCover(), so tests can run them without Chrome.

import fs from 'node:fs';

export const COVER_W = 1200;
export const COVER_H = 630;
export const SMALL_W = 640;
export const COVER_DIR = 'img/insights';
export const COVER_MARKER = 'data-jt-article-cover';
export const CARD_MARKER = 'data-jt-card-cover';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', minus: '−', times: '×', hellip: '…' };

export function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Visible article text: tags, scripts and styles removed, whitespace collapsed. */
export function articleText(html) {
  const start = html.indexOf('<h1');
  const body = (start === -1 ? html : html.slice(start))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return decode(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
}

/** The article's category label, e.g. "Market data". */
export function articleCategory(html) {
  const m = html.match(/<div class="article-meta-top">\s*<span class="cat">([^<]+)<\/span>/);
  return m ? decode(m[1]).trim() : null;
}

/** Table number `index` in the article as { heads, rows } of plain text. */
export function readTable(html, index) {
  const table = [...html.matchAll(/<table[\s\S]*?<\/table>/g)][index]?.[0];
  if (!table) return null;
  const cellText = (c) => decode(c.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const thead = table.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? '';
  const heads = [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => cellText(m[1]));
  const tbody = table.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] ?? table;
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => cellText(c[1])))
    .filter((r) => r.length);
  return { heads, rows };
}

/** "$585,000 (123)" → 585000; anything without a dollar amount → null. */
export function parseMoney(cell) {
  const m = String(cell).match(/\$([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

/** Bars for a chart cover, read from the article's own table. */
export function chartBars(html, chart) {
  const t = readTable(html, chart.table);
  if (!t) throw new Error(`table ${chart.table} not found`);
  const li = t.heads.indexOf(chart.labelColumn);
  const vi = t.heads.indexOf(chart.valueColumn);
  if (li === -1 || vi === -1) throw new Error(`columns "${chart.labelColumn}"/"${chart.valueColumn}" not in table ${chart.table} (${t.heads.join(', ')})`);
  return t.rows
    .map((r) => ({ label: r[li], raw: r[vi], value: parseMoney(r[vi]) }))
    .filter((b) => b.label && b.value !== null)
    .sort((a, b) => a.value - b.value);
}

/** Bars to label on the chart: the cheapest and dearest, or the cheapest three. */
export function highlighted(bars, mode) {
  if (mode === 'lowest3') return bars.slice(0, 3);
  return [bars[0], bars[bars.length - 1]];
}

const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');

/** Problems with a cover, or [] — every figure must be in the article, verbatim. */
export function validateCover(cover, html) {
  const text = articleText(html);
  const errors = [];
  if (!cover.title) errors.push('no title');
  if (!articleCategory(html)) errors.push('article has no category label');
  for (const f of cover.figures ?? []) {
    if (!text.includes(f.value)) errors.push(`figure "${f.value}" does not appear in the article`);
  }
  if (cover.chart) {
    let bars = [];
    try { bars = chartBars(html, cover.chart); } catch (e) { errors.push(e.message); }
    if (bars.length < 5) errors.push(`chart has only ${bars.length} bars`);
    for (const b of highlighted(bars, cover.chart.highlight)) {
      if (!text.includes(b.label) || !text.includes(money(b.value))) errors.push(`chart label ${b.label} ${money(b.value)} not found in the article`);
    }
  }
  if (!cover.chart && !(cover.figures ?? []).length) errors.push('a cover needs figures or a chart');
  return errors;
}

/** Text alternative for the cover, used as the image alt and og:image:alt. */
export function altText(cover, html) {
  if (cover.chart) {
    const bars = chartBars(html, cover.chart);
    const hi = highlighted(bars, cover.chart.highlight);
    const named = hi.map((b) => `${b.label} ${money(b.value)}`).join(', ');
    return `Bar chart: ${cover.chart.caption}, ${bars.length} towns from lowest to highest. Labelled: ${named}.`;
  }
  return `${cover.title}: ${cover.figures.map((f) => `${f.value} ${f.label}`).join('; ')}.`;
}

/**
 * The cover as a standalone 1200×630 HTML page for headless Chrome.
 * `fontUrl(name)` returns a URL for a font file in assets/fonts/.
 */
export function coverPageHtml(cover, html, { fontUrl }) {
  const kicker = articleCategory(html);
  let visual = '';
  if (cover.chart) {
    const bars = chartBars(html, cover.chart);
    const hi = new Set(highlighted(bars, cover.chart.highlight));
    const max = bars[bars.length - 1].value;
    // Bars start at zero so their heights compare honestly.
    // Neighbouring highlights (the cheapest three) would print their labels on
    // top of each other, so they go in a row above the chart instead; the
    // cheapest and dearest are far apart and label their own bars, anchored
    // to the inside edge so they stay within the frame.
    const inRow = cover.chart.highlight === 'lowest3';
    const tag = (b, i) => {
      if (!hi.has(b) || inRow) return '';
      const side = i === 0 ? 'left' : i === bars.length - 1 ? 'right' : 'mid';
      return `<span class="tag ${side}"><b>${esc(money(b.value))}</b>${esc(b.label)}</span>`;
    };
    const cols = bars.map((b, i) => {
      const h = Math.max(2, Math.round((b.value / max) * 100));
      return `<div class="bar${hi.has(b) ? ' on' : ''}" style="height:${h}%">${tag(b, i)}</div>`;
    }).join('');
    const legend = inRow
      ? `<div class="legend">${[...hi].map((b) => `<div><b>${esc(money(b.value))}</b>${esc(b.label)}</div>`).join('')}</div>`
      : '';
    visual = `<div class="chart">${legend}<div class="bars">${cols}</div><p class="cap">${esc(cover.chart.caption)}. Bars start at $0.</p></div>`;
  } else {
    const figs = cover.figures.map((f) => `<div class="fig"><div class="v">${esc(f.value)}</div><div class="l">${esc(f.label)}</div></div>`).join('');
    visual = `<div class="figs n${cover.figures.length}">${figs}</div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Fraunces';src:url('${fontUrl('fraunces-latin.woff2')}') format('woff2');font-weight:100 900}
@font-face{font-family:'DM Sans';src:url('${fontUrl('dm-sans-latin.woff2')}') format('woff2');font-weight:100 1000}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${COVER_W}px;height:${COVER_H}px;overflow:hidden}
body{background:#0b1e3f;color:#fff;font-family:'DM Sans',sans-serif;padding:56px 64px 48px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center;font-size:22px;letter-spacing:3px;text-transform:uppercase;font-weight:700}
.k{color:#34d399;display:flex;align-items:center;gap:14px}.k::before{content:"";width:28px;height:3px;background:#34d399}
.site{color:#c1cad8;letter-spacing:1px;text-transform:none;font-weight:500}
h1{font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:62px;line-height:1.06;letter-spacing:-1.5px;margin-top:26px;max-width:1000px}
.figs{display:grid;gap:40px;margin-top:auto}
.figs.n1{grid-template-columns:1fr}.figs.n2{grid-template-columns:1fr 1fr}.figs.n3{grid-template-columns:1fr 1fr 1fr}
.fig{border-top:2px solid rgba(255,255,255,.18);padding-top:18px}
.v{font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:92px;line-height:1;letter-spacing:-2px;color:#34d399}
.figs.n3 .v{font-size:74px}
.l{font-size:25px;line-height:1.3;color:#dbe2ec;margin-top:12px;max-width:440px}
.chart{margin-top:auto;padding-top:28px}
.bars{height:230px;display:flex;align-items:flex-end;gap:6px;border-bottom:2px solid rgba(255,255,255,.25)}
.bar{flex:1;background:#2c4a78;border-radius:3px 3px 0 0;position:relative}
.bar.on{background:#34d399}
.tag{position:absolute;bottom:calc(100% + 10px);white-space:nowrap;font-size:19px;color:#dbe2ec;line-height:1.2}
.tag.left{left:0;text-align:left}.tag.right{right:0;text-align:right}.tag.mid{left:50%;transform:translateX(-50%);text-align:center}
.legend{display:flex;gap:48px;margin-bottom:22px;font-size:21px;color:#dbe2ec;line-height:1.25}
.legend b{display:block;font-family:'Fraunces',Georgia,serif;font-size:40px;color:#34d399;letter-spacing:-.5px}
.tag b{display:block;font-family:'Fraunces',Georgia,serif;font-size:28px;color:#fff}
.cap{font-size:21px;color:#c1cad8;margin-top:14px}
</style></head><body>
<div class="top"><span class="k">${esc(kicker)}</span><span class="site">joetay.com</span></div>
<h1>${esc(cover.title)}</h1>
${visual}
</body></html>`;
}

/** Public paths of a cover's image files. */
export function coverPaths(slug) {
  const base = `/${COVER_DIR}/${slug}`;
  return { jpg: `${base}.jpg`, jpgSmall: `${base}-${SMALL_W}.jpg`, webp: `${base}.webp`, webpSmall: `${base}-${SMALL_W}.webp` };
}

/** The <figure> that opens the article. */
export function articleFigureHtml(cover, alt) {
  const p = coverPaths(cover.slug);
  const sizes = '(max-width: 780px) 100vw, 732px';
  return `<figure class="article-cover" ${COVER_MARKER}><picture><source type="image/webp" srcset="${p.webpSmall} ${SMALL_W}w, ${p.webp} ${COVER_W}w" sizes="${sizes}"><img src="${p.jpg}" srcset="${p.jpgSmall} ${SMALL_W}w, ${p.jpg} ${COVER_W}w" sizes="${sizes}" width="${COVER_W}" height="${COVER_H}" alt="${esc(alt)}" fetchpriority="high" decoding="async"></picture></figure>`;
}

/**
 * Thumbnail for a card that links to the article: the insights index, and the
 * homepage "Latest guides" block. Decorative, because the card's own heading
 * names the article.
 */
export function cardImageHtml(cover, { className = 'blog-card-img' } = {}) {
  const p = coverPaths(cover.slug);
  return `<picture class="${className}" ${CARD_MARKER}><source type="image/webp" srcset="${p.webpSmall}"><img src="${p.jpgSmall}" width="${SMALL_W}" height="${Math.round((COVER_H * SMALL_W) / COVER_W)}" alt="" loading="lazy" decoding="async"></picture>`;
}

const SITE = 'https://joetay.com';
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The cover for an article slug from insights/article-covers.json, or null. */
export function loadCover(slug, file = 'insights/article-covers.json') {
  return JSON.parse(fs.readFileSync(file, 'utf8')).covers.find((c) => c.slug === slug) ?? null;
}

/**
 * The article with its cover in place: the opening figure before the article
 * body, and the share preview (og:image with size and alt, twitter:image, the
 * BlogPosting image). Idempotent. Used by apply-article-cover.mjs and by the
 * article generators, which call it on their output the way they call
 * injectToc(), so their --check stays byte-for-byte.
 */
export function injectCover(html, cover) {
  if (!cover) return html;
  const errs = validateCover(cover, html);
  if (errs.length) throw new Error(`${cover.slug}: ${errs.join('; ')}`);
  const alt = altText(cover, html);
  const url = `${SITE}${coverPaths(cover.slug).jpg}`;
  let s = html;
  s = s.replace(/\n<meta property="og:image:(?:width|height|alt)" content="[^"]*">/g, '');
  s = s.replace(/\n<meta name="twitter:image:alt" content="[^"]*">/g, '');
  if (!/<meta property="og:image" content="[^"]*">/.test(s)) throw new Error(`${cover.slug}: no og:image tag`);
  s = s.replace(/<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image" content="${url}">\n<meta property="og:image:width" content="${COVER_W}">\n<meta property="og:image:height" content="${COVER_H}">\n<meta property="og:image:alt" content="${attr(alt)}">`);
  s = s.replace(/<meta name="twitter:image" content="[^"]*">/,
    `<meta name="twitter:image" content="${url}">\n<meta name="twitter:image:alt" content="${attr(alt)}">`);
  // The BlogPosting image is the first "image" in the JSON-LD.
  s = s.replace(/"image": "https:\/\/joetay\.com\/[^"]*"/, `"image": "${url}"`);
  s = s.replace(new RegExp(`<figure class="article-cover" ${COVER_MARKER}>[\\s\\S]*?</figure>\\n`), '');
  if (!s.includes('<section class="article-body"')) throw new Error(`${cover.slug}: no article body section`);
  return s.replace('<section class="article-body"', `${articleFigureHtml(cover, alt)}\n<section class="article-body"`);
}
