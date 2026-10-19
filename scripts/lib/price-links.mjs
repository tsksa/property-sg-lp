// Shared HDB-town and condo-district link lists for the most-linked pages.
//
// Why (JOE-448): Google had never crawled 21 of the 26 /hdb-prices/<town>/
// pages, /condo-prices/ or 22 of its 26 district pages. No technical blocker:
// the pages Google already indexes and revisits (homepage, /neighbour-prices/,
// /valuation.html, /calculator/, the seller guides) linked calculators from
// every template but not one town or district page, so each town had about
// four inbound links and the hub none in body copy. These lists give every
// price page a plain, crawlable <a> from those pages.
//
// Read from the filesystem, never a hand-kept list, so a block can only ever
// link a page that exists and picks up a new town or district on the next run.
// scripts/apply-price-links.mjs injects the block; the project-page and
// new-launch generators reuse the same lists and anchors.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DISTRICTS } from './condo-districts.mjs';

export const PRICE_LINKS_MARKER = 'data-jt-price-links';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Town pages on disk: [{ slug, name, href, label }], alphabetical by slug. */
export function priceTowns(root = ROOT) {
  const dir = path.join(root, 'hdb-prices');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'index.html')))
    .map((entry) => entry.name)
    .sort()
    .map((slug) => {
      // The town's own H1 ("Kallang/Whampoa HDB resale prices") is the name the
      // generator chose, so the anchor matches the page it points at.
      const html = fs.readFileSync(path.join(dir, slug, 'index.html'), 'utf8');
      const name = html.match(/<h1>([^<]+) HDB resale prices<\/h1>/)?.[1];
      if (!name) throw new Error(`hdb-prices/${slug}/index.html has no "<town> HDB resale prices" H1`);
      return { slug, name, href: `/hdb-prices/${slug}/`, label: `${name} HDB resale prices` };
    });
}

/** "D11 Newton, Novena, Thomson" for 'D11' or '11'. */
export function districtName(district) {
  const code = String(district).replace(/^D/i, '').padStart(2, '0');
  const area = DISTRICTS[code];
  if (!area) throw new Error(`unknown postal district ${district}`);
  return `D${code} ${area}`;
}

/** District pages on disk: [{ id: 'D01', href, name, label }], in district order. */
export function priceDistricts(root = ROOT) {
  const dir = path.join(root, 'condo-prices');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^d\d\d$/.test(entry.name) && fs.existsSync(path.join(dir, entry.name, 'index.html')))
    .map((entry) => entry.name)
    .sort()
    .map((dirName) => {
      const id = dirName.toUpperCase();
      const name = districtName(id);
      return { id, href: `/condo-prices/${dirName}/`, name, label: `${name} condo resale prices` };
    });
}

// Hub anchors are the hubs' own H1s.
const HUBS = {
  hdb: ['/hdb-prices/', 'HDB resale prices, town by town'],
  condo: ['/condo-prices/', 'Condo resale prices, district by district'],
};

// Counted, not "every": a district with too few caveats gets no page
// (MIN_TX_12M in generate-condo-pages.mjs), so not all 28 are listed.
const LEDES = {
  towns: 'Medians by flat type and the latest registered transactions for each town, from official HDB data.',
  both: (towns, districts) => `Medians and the latest transactions for ${towns} HDB towns and ${districts} condo districts, from official HDB and URA data.`,
};

const listHtml = (className, items) => `    <ul class="jt-pl-list ${className}">
${items.map((item) => `      <li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`).join('\n')}
    </ul>`;

// Colours are inherited or translucent so one stylesheet reads correctly on
// seven templates in both themes; links use the AA emerald (#047857 is 5.5:1 on
// white) and the theme's own dark-mode link colour.
const STYLE = `<style data-jt-price-links-css>
.jt-pl{margin:40px 0 0;text-align:left;grid-column:1/-1;min-width:0}
.jt-pl .jt-pl-inner{padding:22px 24px;border:1px solid rgba(127,127,127,.24);border-radius:14px;background:rgba(127,127,127,.05)}
.jt-pl-band{margin:0;padding:0 24px 72px}
.jt-pl-band .jt-pl-inner{max-width:1080px;margin:0 auto;padding:0;border:0;background:none}
.jt-pl .jt-pl-title{font-family:'Fraunces',Georgia,serif;font-size:1.35rem;line-height:1.25;margin:0 0 6px;letter-spacing:-.2px}
.jt-pl h3.jt-pl-title{font-size:1.15rem}
.jt-pl-band .jt-pl-title{font-size:clamp(1.6rem,3.2vw,2.2rem);margin-bottom:10px}
.jt-pl .jt-pl-lede{margin:0 0 12px;font-size:.92rem;line-height:1.55}
.jt-pl .jt-pl-sub{margin:16px 0 4px;font-family:inherit;font-size:.74rem;line-height:1.4;letter-spacing:.09em;text-transform:uppercase;font-weight:700}
.jt-pl .jt-pl-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:0 20px}
.jt-pl .jt-pl-districts{grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))}
.jt-pl .jt-pl-list li{margin:0;padding:0;border:0;min-width:0}
.jt-pl .jt-pl-list li::before{content:none}
.jt-pl a{color:var(--emerald-aa,#047857);text-decoration:none}
.jt-pl .jt-pl-list a{display:block;padding:7px 0;font-size:.9rem;line-height:1.35;font-weight:500;overflow-wrap:anywhere}
.jt-pl a:hover{text-decoration:underline}
.jt-pl .jt-pl-hubs{margin:14px 0 0;font-size:.9rem;line-height:1.6}
.jt-pl .jt-pl-hubs a{font-weight:700;text-decoration:underline;text-underline-offset:.15em}
html.jt-theme-dark .jt-pl a{color:#6ee7c1}
@media(max-width:600px){
.jt-pl .jt-pl-inner{padding:18px 16px}
.jt-pl-band{padding:0 20px 48px}
.jt-pl-band .jt-pl-inner{padding:0}
.jt-pl .jt-pl-towns{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px}
}
</style>`;

/**
 * The block. Stable output — apply-price-links.mjs --check diffs it.
 *
 * @param {object} o
 * @param {Array} [o.towns]      entries from priceTowns()
 * @param {Array} [o.districts]  entries from priceDistricts()
 * @param {string[]} [o.hubs]    keys of HUBS to link after the lists
 * @param {2|3} [o.level]        heading level; 3 inside articles so the
 *                               h2-based table of contents does not change
 * @param {string} [o.id]        section id (also prefixes the heading id)
 * @param {string} [o.className] extra classes on the <section>
 */
export function priceLinksHtml({ towns = [], districts = [], hubs = [], level = 2, id = 'price-links', className = '' }) {
  const both = towns.length && districts.length;
  const sub = level + 1;
  const title = both ? 'Resale prices by town and district' : towns.length ? 'HDB resale prices by town' : 'Condo resale prices by district';
  const lede = both ? LEDES.both(towns.length, districts.length) : towns.length ? LEDES.towns : '';
  const groups = [];
  if (towns.length) groups.push(`${both ? `    <h${sub} class="jt-pl-sub">HDB towns</h${sub}>\n` : ''}${listHtml('jt-pl-towns', towns)}`);
  if (districts.length) groups.push(`${both ? `    <h${sub} class="jt-pl-sub">Condo districts</h${sub}>\n` : ''}${listHtml('jt-pl-districts', districts)}`);
  const hubLinks = hubs.map((key) => `<a href="${HUBS[key][0]}">${HUBS[key][1]}</a>`).join(' · ');
  return `<!-- Price links — generated by scripts/apply-price-links.mjs -->
<section class="jt-pl${className ? ` ${className}` : ''}" id="${esc(id)}" ${PRICE_LINKS_MARKER} aria-labelledby="${esc(id)}-title">
  <div class="jt-pl-inner">
    <h${level} class="jt-pl-title" id="${esc(id)}-title">${title}</h${level}>
${lede ? `    <p class="jt-pl-lede">${lede}</p>\n` : ''}${groups.join('\n')}
${hubLinks ? `    <p class="jt-pl-hubs">${hubLinks}</p>\n` : ''}  </div>
</section>
${STYLE}`;
}

// The block, from its opening comment through its closing </style>.
export const PRICE_LINKS_RE = new RegExp(
  `<!-- Price links[^\\n]*-->\\n<section[^>]*${PRICE_LINKS_MARKER}[^>]*>[\\s\\S]*?</section>\\n<style data-jt-price-links-css>[\\s\\S]*?</style>`,
);

// Where each page gets its block. `before` is the literal text the block is
// inserted ahead of the first time; later runs replace the block in place.
// Nothing goes on the Google Ads landers (/sell/, /rent-out/,
// /sell-hdb/singapore/): outbound links there leak paid traffic.
export const PRICE_LINK_TARGETS = [
  // Between the FAQ and the latest guides; tests/homepage-ux.test.mjs pins
  // that section order. `section` picks up the homepage's section type and
  // dark-mode background; jt-pl-band drops the card for a full-width band.
  { file: 'index.html', before: '<!-- Latest guides', lists: ['towns'], hubs: ['hdb', 'condo'], className: 'section jt-pl-band' },
  // After #results, which stays hidden until a lookup, so the block reads as
  // following the lookup card without ever splitting the card from its results.
  { file: 'neighbour-prices/index.html', before: '  <section class="np-how">', lists: ['towns', 'districts'], hubs: ['hdb', 'condo'] },
  { file: 'valuation.html', before: '</main>', lists: ['towns', 'districts'], hubs: ['hdb', 'condo'] },
  // Inside the guide, after its reading paragraphs: the "other tools"
  // paragraph sits in a collapsed disclosure above the calculator, where a
  // 26-link list would hide or push down the tool itself.
  { file: 'calculator/index.html', before: '    <p class="calc-sources">', lists: ['towns'], hubs: ['hdb'], level: 3 },
  { file: 'insights/index.html', before: '  <section class="blog-guide blog-districts" id="condo-districts"', lists: ['towns'], hubs: ['hdb'], id: 'hdb-towns' },
  { file: 'insights/hdb-valuation-explained.html', before: '</main>', lists: ['towns'], hubs: ['hdb'], level: 3 },
  { file: 'insights/how-long-to-sell-hdb-singapore-2026.html', before: '</main>', lists: ['towns'], hubs: ['hdb'], level: 3 },
];

/** The block for one entry of PRICE_LINK_TARGETS. */
export function priceLinksFor(target, root = ROOT) {
  return priceLinksHtml({
    towns: target.lists.includes('towns') ? priceTowns(root) : [],
    districts: target.lists.includes('districts') ? priceDistricts(root) : [],
    hubs: target.hubs || [],
    level: target.level || 2,
    id: target.id || 'price-links',
    className: target.className || '',
  });
}

/** Returns the page with its block inserted or refreshed; throws if there is nowhere to put it. */
export function applyPriceLinks(html, target, root = ROOT) {
  const block = priceLinksFor(target, root);
  if (PRICE_LINKS_RE.test(html)) return html.replace(PRICE_LINKS_RE, () => block);
  const at = html.indexOf(target.before);
  if (at === -1) throw new Error(`${target.file}: no "${target.before}" anchor to insert the price links before`);
  return `${html.slice(0, at)}${block}\n${html.slice(at)}`;
}
