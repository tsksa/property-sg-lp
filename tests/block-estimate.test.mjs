import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as core from '../assets/block-estimate-core.mjs';
import { fetchSales, SALES_FETCH_LIMITS } from '../assets/block-sales-data.mjs';

import {
  abbrevRoad, normalisePostal, median, quantile, monthsBetween, flatTypesByVolume,
  summarise, netProceeds, basisLabel, PROCEEDS_DEFAULTS,
} from '../assets/block-estimate-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NOW = new Date('2026-09-18T12:00:00+08:00');
const sale = (month, price, type = '4 ROOM', extra = {}) => ({ month, resale_price: String(price), flat_type: type, floor_area_sqm: '93', storey_range: '07 TO 09', block: '123', ...extra });

test('postal codes and road names normalise the way the data sources expect', () => {
  assert.equal(normalisePostal(' 520 123 '), '520123');
  assert.equal(normalisePostal('52012'), null);
  assert.equal(normalisePostal('5201234'), null);
  assert.equal(abbrevRoad('Ang Mo Kio Avenue 3'), 'ANG MO KIO AVE 3');
  assert.equal(abbrevRoad('Commonwealth Crescent'), "C'WEALTH CRES");
});

test('median, quantile and month arithmetic', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
  assert.equal(quantile([10, 20, 30, 40], 0.75), 32.5);
  assert.equal(monthsBetween('2026-09', NOW), 0);
  assert.equal(monthsBetween('2025-09', NOW), 12);
  assert.equal(monthsBetween('bad', NOW), Infinity);
});

test('flat types are offered most-traded first', () => {
  assert.deepEqual(flatTypesByVolume([sale('2026-01', 1, '3 ROOM'), sale('2026-01', 1), sale('2026-02', 1)]), ['4 ROOM', '3 ROOM']);
});

test('the range comes from the block when it has three recent sales of the type', () => {
  const block = [sale('2026-08', 600000), sale('2026-05', 620000), sale('2026-02', 640000), sale('2026-01', 660000), sale('2025-06', 500000), sale('2026-07', 400000, '3 ROOM')];
  const s = summarise({ blockRecords: block, streetRecords: block, flatType: '4 ROOM', now: NOW });
  assert.equal(s.range.scope, 'block');
  assert.equal(s.range.months, 12);
  assert.equal(s.range.count, 4);
  assert.equal(s.range.low, 615000);
  assert.equal(s.range.high, 645000);
  assert.equal(s.range.median, 630000);
  assert.equal(s.latest.month, '2026-08');
  assert.equal(s.recent.length, 5);
  assert.ok(s.recent.every((r) => r.flat_type === '4 ROOM'));
});

test('a thin block falls back to the street, and too few sales give no range', () => {
  const block = [sale('2026-08', 600000)];
  const street = [...block, sale('2026-06', 580000, '4 ROOM', { block: '125' }), sale('2026-03', 590000, '4 ROOM', { block: '127' })];
  const s = summarise({ blockRecords: block, streetRecords: street, flatType: '4 ROOM', now: NOW });
  assert.equal(s.range.scope, 'street');
  assert.equal(s.range.count, 3);
  assert.equal(s.range.low, 580000);
  assert.equal(s.range.high, 600000);
  assert.equal(basisLabel(s.range, 'Ang Mo Kio Ave 3'), 'Lowest to highest of 3 4-room sales along Ang Mo Kio Ave 3, Oct 2025–Sep 2026 (12 registration months).');
  assert.equal(basisLabel({ ...s.range, scope: 'block', count: 8 }, 'x'), 'Middle half of 8 4-room sales in your block, Oct 2025–Sep 2026 (12 registration months).');
  const none = summarise({ blockRecords: block, streetRecords: block, flatType: '4 ROOM', now: NOW });
  assert.equal(none.range, null);
  assert.equal(none.recent.length, 1);
});

test('year-on-year change needs five sales in each window', () => {
  const recent = ['2026-08', '2026-07', '2026-05', '2026-03', '2025-11'].map((m) => sale(m, 660000));
  const prior = ['2025-08', '2025-06', '2025-03', '2025-01', '2024-11'].map((m) => sale(m, 600000));
  assert.equal(summarise({ blockRecords: [], streetRecords: [...recent, ...prior], flatType: '4 ROOM', now: NOW }).change, 10);
  assert.equal(summarise({ blockRecords: [], streetRecords: [...recent, ...prior.slice(1)], flatType: '4 ROOM', now: NOW }).change, null);
});

test('registration windows include exactly 12 or 24 Singapore calendar months', () => {
  const now = new Date('2026-10-22T04:00:00Z');
  assert.deepEqual(core.registrationWindow(12, now), { startMonth: '2025-11', endMonth: '2026-10' });
  assert.deepEqual(core.registrationWindow(24, now), { startMonth: '2024-11', endMonth: '2026-10' });
  assert.deepEqual(core.registrationWindow(12, now, 12), { startMonth: '2024-11', endMonth: '2025-10' });
  const recent = [sale('2026-10', 600000), sale('2026-01', 600000), sale('2025-11', 600000)];
  const older = [sale('2025-10', 300000), sale('2024-11', 300000), sale('2024-10', 100000)];
  const args = { blockRecords: [...recent, ...older], streetRecords: [], flatType: '4 ROOM', now };
  assert.equal(summarise(args).range.count, 3, 'offset 11 is recent; offset 12 is not');
  const fallback = summarise({ ...args, blockRecords: [...recent.slice(1), ...older] }).range;
  assert.equal(fallback.months, 24);
  assert.equal(fallback.count, 4, 'offset 23 is included; offset 24 is not');
  const changeRecords = [...Array.from({ length: 5 }, () => sale('2025-11', 660000)), ...Array.from({ length: 5 }, () => sale('2025-10', 600000)), ...Array.from({ length: 5 }, () => sale('2024-10', 1))];
  assert.equal(summarise({ ...args, blockRecords: [], streetRecords: changeRecords }).change, 10, 'adjacent recent and prior windows do not overlap');
  for (const tz of ['UTC', 'America/Los_Angeles']) {
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', "import {registrationWindow,monthsBetween} from './assets/block-estimate-core.mjs'; const now=new Date('2026-10-31T16:00:00Z'); console.log(JSON.stringify([registrationWindow(12,now),monthsBetween('2026-11',now)]));"], { cwd: ROOT, env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(result), [{ startMonth: '2025-12', endMonth: '2026-11' }, 0], tz);
  }
});

test('invalid and future rows cannot inflate a sample, appear as latest, or create a flat type', () => {
  const invalid = ['2026-10', '2026-13', '2026-00', '2026-09-extra', '2026-9', 'bad'].map((m) => sale(m, 999999, '5 ROOM'));
  invalid.push(...['', 'bogus', 'Infinity', '0', '-1'].map((p) => sale('2026-08', p, '5 ROOM')));
  const valid = [sale('2026-09', 600000), sale('2026-08', 600900), sale('2026-07', 610000)];
  assert.deepEqual(core.validSalesRecords([...valid, ...invalid], NOW), valid);
  assert.deepEqual(flatTypesByVolume([...valid, ...invalid], NOW), ['4 ROOM']);
  const thin = summarise({ blockRecords: [valid[0], ...invalid], streetRecords: [], flatType: '4 ROOM', now: NOW });
  assert.equal(thin.range, null);
  assert.equal(thin.latest, valid[0]);
  assert.equal(thin.blockCount, 1);
  const noArea = valid.map((r) => ({ ...r, floor_area_sqm: 'unknown' }));
  const s = summarise({ blockRecords: noArea, streetRecords: noArea, flatType: '4 ROOM', now: NOW });
  assert.equal(s.range.count, 3, 'a missing area does not discard a valid sale price');
  assert.equal(s.range.psf, null, 'missing areas never show a zero-dollar PSF');
});

test('basis priority is applied per flat type, with block 24 ahead of street 12', () => {
  const block = [sale('2026-09', 500000), sale('2025-03', 510000), sale('2024-10', 520000)];
  const street = [...block, sale('2026-08', 900000), sale('2026-07', 910000)];
  const args = { blockRecords: block, streetRecords: street, flatType: '4 ROOM', now: NOW };
  assert.equal(summarise(args).range.scope, 'block');
  assert.equal(summarise(args).range.months, 24);
  assert.equal(summarise(args).range.median, 510000);
  const fallback = summarise({ ...args, blockRecords: block.slice(0, 1), streetRecords: block }).range;
  assert.equal(fallback.scope, 'street');
  assert.equal(fallback.months, 24);
});

const response = (records, total = records.length) => ({ success: true, result: { records, total } });

test('both surfaces fetch the same block and street records and expose capped samples', async () => {
  const urls = [];
  const block = [sale('2026-09', 600000)];
  const street = [...block, sale('2026-08', 700000, '4 ROOM', { block: '125' })];
  const sales = await fetchSales({ block: '123', road: 'ANG MO KIO AVENUE 3' }, async (url) => {
    urls.push(new URL(url));
    return urls.length === 1 ? response(block, 250) : response(street, 700);
  });
  assert.deepEqual(sales, { road: 'ANG MO KIO AVE 3', block, street, blockTruncated: true, streetTruncated: true });
  assert.deepEqual(SALES_FETCH_LIMITS, { block: 200, street: 600 });
  assert.deepEqual(urls.map((u) => u.searchParams.get('limit')), ['200', '600']);
  assert.deepEqual(urls.map((u) => JSON.parse(u.searchParams.get('filters'))), [{ block: '123', street_name: 'ANG MO KIO AVE 3' }, { street_name: 'ANG MO KIO AVE 3' }]);
  for (const u of urls) {
    assert.equal(u.searchParams.get('sort'), 'month desc');
    assert.equal(u.searchParams.get('fields'), 'month,town,flat_type,block,street_name,storey_range,floor_area_sqm,resale_price');
  }
  for (const rel of ['assets/block-estimate.js', 'neighbour-prices/index.html']) {
    const source = read(rel);
    assert.match(source, /import \{ fetchSales \} from ['"][^'"]*block-sales-data\.mjs['"]/);
    assert.match(source, /fetchSales\(addr, fetchJSON\)/);
    assert.doesNotMatch(source, /datastore_search|since January 2017|See every sale/);
  }
});

test('shared retrieval handles raw-road fallback, empty results, missing totals and failures', async () => {
  const seen = [];
  const block = [sale('2026-09', 600000)];
  const fallback = await fetchSales({ block: '123', road: 'ANG MO KIO AVENUE 3' }, async (url) => {
    seen.push(JSON.parse(new URL(url).searchParams.get('filters')));
    return response(seen.length === 1 ? [] : block);
  });
  assert.equal(fallback.road, 'ANG MO KIO AVENUE 3');
  assert.equal(seen[2].street_name, 'ANG MO KIO AVENUE 3');
  const addr = { block: '123', road: 'ANG MO KIO AVE 3' };
  const empty = await fetchSales(addr, async () => response([]));
  assert.deepEqual(empty, { road: addr.road, block: [], street: [], blockTruncated: false, streetTruncated: false });
  const capped = await fetchSales(addr, async (url) => ({ success: true, result: { records: Array.from({ length: Number(new URL(url).searchParams.get('limit')) }, () => block[0]) } }));
  assert.equal(capped.blockTruncated, true);
  assert.equal(capped.streetTruncated, true);
  for (const bad of [{ success: false }, { success: true, result: {} }]) await assert.rejects(fetchSales(addr, async () => bad), /bad response/);
  let call = 0;
  await assert.rejects(fetchSales(addr, async () => { if (++call === 1) return response(block); throw new Error('street unavailable'); }), /street unavailable/, 'a partial request failure must not masquerade as a complete result');
});

// Small DOM harness: execute both production renderers without making requests.
class RenderNode {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; this.style = {}; this.className = ''; this.classList = { add() {}, remove() {}, toggle() {} }; }
  set textContent(value) { this.children = []; this.text = String(value); }
  get textContent() { return (this.text || '') + this.children.map((n) => typeof n === 'string' ? n : n.textContent).join(''); }
  get childElementCount() { return this.children.filter((n) => n instanceof RenderNode).length; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener() {}
  focus() {}
  scrollIntoView() {}
  querySelector(selector) { return descend(this).find((n) => selector.startsWith('.') ? n.className.split(' ').includes(selector.slice(1)) : n.tagName === selector) || null; }
}
function descend(node) { return node.children.flatMap((n) => n instanceof RenderNode ? [n, ...descend(n)] : []); }

function renderHarness() {
  const nodes = new Map();
  const document = {
    createElement: (tag) => new RenderNode(tag), createTextNode: (text) => String(text), createDocumentFragment: () => new RenderNode('fragment'),
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new RenderNode()); return nodes.get(id); }, querySelectorAll: () => [],
  };
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } }
  const context = { ...core, fetchSales, document, window: {}, location: { search: '' }, URLSearchParams, Date: FixedDate };
  const imports = /^import[\s\S]*?from ['"][^'"]+['"];\s*/gm;
  const widget = { ...context };
  vm.runInNewContext(read('assets/block-estimate.js').replace(imports, '') + '\nglobalThis.renderWidget = renderResult;', widget);
  const neighbour = { ...context };
  const page = read('neighbour-prices/index.html').match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(page.replace(imports, '').replace(/\}\)\(\);\s*$/, 'globalThis.renderNeighbour = render;\n})();'), neighbour);
  return { nodes, widget: widget.renderWidget, neighbour: neighbour.renderNeighbour };
}

test('both actual renderers show identical per-type medians, periods and fallback scope', () => {
  const h = renderHarness();
  const addr = { block: '123', road: 'ANG MO KIO AVE 3' };
  const block = [sale('2026-09', 500000), sale('2026-08', 600000), sale('2026-07', 600900), sale('2025-10', 700000), sale('2026-08', 400000, '3 ROOM'), sale('2025-03', 410000, '3 ROOM'), sale('2024-10', 420000, '3 ROOM'), sale('2026-08', 800000, '5 ROOM')];
  const street = [...block, sale('2026-07', 810000, '5 ROOM', { block: '125' }), sale('2026-06', 820000, '5 ROOM', { block: '127' })];
  const sales = { block, street, blockTruncated: false, streetTruncated: true };
  h.neighbour(addr, sales);
  const summary = h.nodes.get('npSummary');
  for (const [type, median, period, scope] of [['4 ROOM', '$600,000', 'Oct 2025–Sep 2026', 'in your block'], ['3 ROOM', '$410,000', 'Oct 2024–Sep 2026', 'in your block'], ['5 ROOM', '$810,000', 'Oct 2025–Sep 2026', 'along']]) {
    const root = new RenderNode(); root.id = 'test-widget';
    const result = new RenderNode(); result.className = 'jte-result'; root.append(result);
    h.widget(root, { addr, sales, flatType: type, postal: '560123', now: NOW });
    const stat = descend(result).find((n) => n.tagName === 'dt' && n.textContent === core.MEDIAN_ROUNDING_LABEL);
    const pair = descend(result).find((n) => n.children.includes(stat));
    assert.equal(pair.children[1].textContent, median, `${type} widget median`);
    const item = summary.children.find((n) => n.textContent.startsWith(type + ':'));
    assert.ok(item.textContent.includes(core.MEDIAN_ROUNDING_LABEL + ' ' + median), `${type} neighbour median uses the same $1,000 rounding`);
    for (const text of [period, scope, 'registration months']) {
      assert.ok(result.textContent.includes(text), `${type} widget labels ${text}`);
      assert.ok(item.textContent.includes(text), `${type} neighbour labels ${text}`);
    }
    assert.match(result.textContent, /older sales within the stated periods may be missing/);
    const table = result.querySelector('.jte-table-wrap');
    assert.equal(table.attributes.tabindex, '0');
    assert.equal(table.attributes.role, 'region');
    assert.equal(table.attributes['aria-describedby'], 'test-widget-p-table-hint');
  }
  assert.match(h.nodes.get('npBasisNote').textContent, /older sales within the stated periods may be missing/);
  assert.match(h.nodes.get('resultsSub').textContent, /8 valid records loaded for this block; latest 8 shown/);
});

test('the sold-prices renderer handles empty, thin and invalid samples without misleading medians', () => {
  const h = renderHarness();
  const addr = { block: '123', road: 'ANG MO KIO AVE 3' };
  h.neighbour(addr, { block: [], street: [] });
  assert.match(h.nodes.get('resultsSub').textContent, /No valid records loaded/);
  assert.equal(h.nodes.get('npSummary').style.display, 'none');
  assert.equal(h.nodes.get('blockTableWrap').style.display, 'none');
  h.neighbour(addr, { block: [sale('2026-09', 600000), sale('2026-10', 900000), sale('2026-08', 'bogus')], street: [] });
  assert.match(h.nodes.get('resultsSub').textContent, /1 valid record loaded/);
  assert.match(h.nodes.get('npSummary').textContent, /Too few recent sales/);
  assert.doesNotMatch(h.nodes.get('npSummary').textContent, /Median/);
  assert.doesNotMatch(h.nodes.get('blockTableWrap').textContent, /900,000|NaN/);
});

test('net proceeds use the site guide defaults and reject bad input', () => {
  assert.deepEqual(PROCEEDS_DEFAULTS, { commissionRate: 2, gstRate: 9, legalFees: 2500, hdbFee: 80 });
  const r = netProceeds({ salePrice: 600000, outstandingLoan: 150000, cpfRefund: 200000 });
  assert.equal(r.commission, 13080);
  assert.equal(r.deductions, 150000 + 200000 + 13080 + 2500 + 80);
  assert.equal(r.cash, 234340);
  assert.throws(() => netProceeds({ salePrice: -1 }), RangeError);
  assert.throws(() => netProceeds({ salePrice: 1, commissionRate: 50 }), RangeError);
});

test('the guide the defaults quote still says what the calculator assumes', () => {
  const guide = read('insights/selling-hdb-after-mop-singapore.html');
  assert.match(guide, /agent commission \(2% \+ GST for sales\)/);
  assert.match(guide, /legal fees \(~\$1,800–\$2,500\)/);
  assert.match(guide, /HDB resale administrative fees \(~\$80\)/);
});

// ── Widget wiring ────────────────────────────────────────────────────────────

import { pulseFor } from '../scripts/generate-market-pulse.mjs';

test('the homepage and valuation page carry the widget with a no-JavaScript fallback', () => {
  for (const [rel, context] of [['index.html', 'home'], ['valuation.html', 'valuation']]) {
    const html = read(rel);
    assert.match(html, new RegExp(`data-jt-estimate data-context="${context}"`), rel);
    assert.match(html, /<form class="jte-form" action="\/neighbour-prices\/" method="get"/, `${rel}: fallback form`);
    assert.match(html, /<script type="module" src="\/assets\/block-estimate\.js"><\/script>/, rel);
    assert.match(html, /<link rel="stylesheet" href="\/assets\/block-estimate\.css">/, rel);
    assert.match(html, /addEventListener\('jte:valuation'/, `${rel}: valuation handoff`);
  }
  const valuation = read('valuation.html');
  assert.match(valuation, /params\.get\('postal'\)/, 'valuation page must accept ?postal=');
  const neighbour = read('neighbour-prices/index.html');
  assert.match(neighbour, /new URLSearchParams\(location\.search\)\.get\('postal'\)/, 'neighbour-prices must run a ?postal= lookup');
});

test('the widget renders API data as text, keeps its figures labelled and tracks the funnel', () => {
  const js = read('assets/block-estimate.js');
  assert.doesNotMatch(js, /\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\(/, 'API data must never be parsed as HTML');
  assert.match(js, /Not a valuation/);
  assert.match(js, /Source: HDB resale flat prices via data\.gov\.sg/);
  for (const event of ['estimate_search', 'estimate_shown', 'estimate_cta']) assert.match(js, new RegExp(`'${event}'`), event);
  assert.match(js, /new CustomEvent\('jte:valuation'/);
});

test('the content security policy admits the two data sources the widget calls', () => {
  const toml = read('netlify.toml');
  const csp = toml.match(/Content-Security-Policy[^=]*=\s*"([^"]+)"/)?.[1] || '';
  const connect = csp.match(/connect-src ([^;]+)/)?.[1] || '';
  assert.match(connect, /https:\/\/data\.gov\.sg/);
  assert.match(connect, /https:\/\/www\.onemap\.gov\.sg/);
});

test('the market line is a complete month, refreshed by the monthly workflow', () => {
  const pulse = JSON.parse(read('assets/market-pulse.json'));
  assert.match(pulse.month, /^\d{4}-\d{2}$/);
  assert.ok(Number.isInteger(pulse.deals) && pulse.deals >= 500, 'implausible monthly count');
  assert.ok(Number.isInteger(pulse.median) && pulse.median > 200000 && pulse.median < 2000000, 'implausible median');
  const flow = read('.github/workflows/refresh-estate-pages.yml');
  assert.match(flow, /node scripts\/generate-market-pulse\.mjs/);
  assert.match(flow, /git add hdb-prices\/ sitemap\.xml assets\/market-pulse\.json/);
  assert.deepEqual(pulseFor('2026-08', Array.from({ length: 501 }, (_, i) => ({ resale_price: String(500000 + i * 100) }))), {
    month: '2026-08', deals: 501, median: 525000, source: 'HDB Resale Flat Prices (d_8b84c4ee58e3cfc0ece0d773c8ca6abc) via data.gov.sg',
  });
  assert.throws(() => pulseFor('2026-08', [{ resale_price: '1' }]), /thin month/);
});

// WCAG 2.x relative luminance contrast, for the widget's colour tokens.
function contrast(fg, bg) {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

test('widget colour tokens meet WCAG AA in both themes', () => {
  const css = read('assets/block-estimate.css');
  const tokens = (selector) => Object.fromEntries(
    [...(css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1] || '').matchAll(/--jte-([a-z-]+):(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  );
  const light = tokens('.jte');
  const dark = tokens('html.jt-theme-dark .jte');
  for (const [name, t, grounds] of [
    ['light', light, [light.surface, '#f3f5f8', '#faf6ec']],
    ['dark', dark, [dark.surface, '#102447', '#07172f']],
  ]) {
    for (const ground of grounds) {
      for (const role of ['ink', 'muted', 'accent', 'error']) {
        assert.ok(contrast(t[role], ground) >= 4.5, `${name} ${role} ${t[role]} on ${ground}: ${contrast(t[role], ground).toFixed(2)}`);
      }
    }
    assert.ok(contrast(t['on-accent'], t.accent) >= 4.5, `${name} button text on accent`);
    assert.ok(contrast(t['on-accent'], t['accent-hover']) >= 4.5, `${name} button text on hover`);
  }
});
