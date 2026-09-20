import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  abbrevRoad, normalisePostal, median, quantile, monthsBetween, flatTypesByVolume,
  summarise, netProceeds, basisLabel, PROCEEDS_DEFAULTS,
} from '../assets/block-estimate-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NOW = new Date(2026, 8, 18); // 18 Sep 2026
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
  assert.equal(basisLabel(s.range, 'Ang Mo Kio Ave 3'), 'Lowest to highest of 3 sales along Ang Mo Kio Ave 3 in the last 12 months.');
  assert.equal(basisLabel({ scope: 'block', count: 8, months: 12 }, 'x'), 'Middle half of 8 sales in your block in the last 12 months.');
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
