// Value card + trend chart on the HDB town and condo district pages (JOE-394).
//
// Pins the maths behind the card (quantiles, the rolling $psf series, the chart
// axis), checks every generated page carries a card whose headline agrees with
// the page's own FAQ markup, and guards the refresh workflows against the bug
// found while building it: they re-applied only part of the shared page
// furniture, so each monthly refresh PR stripped the consent banner, theme and
// mobile menu from every regenerated page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  quantile, shiftMonth, monthLabel, rollingPsfSeries, trendSvg, seriesChange, valueCardHtml, leaseBand, likeForLikeChange, MIN_SPAN,
} from '../scripts/lib/value-card.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const WINDOW = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

function flatSeries(values) {
  return WINDOW.map((month, i) => ({ month, n: 30, psf: values[i] }));
}

test('quantile interpolates linearly and ignores input order', () => {
  assert.equal(quantile([4, 1, 3, 2], 0.5), 2.5);
  assert.equal(quantile([10, 20, 30, 40, 50], 0.25), 20);
  assert.equal(quantile([1, 2, 3, 4], 0.75), 3.25);
  assert.equal(quantile([], 0.5), null);
});

test('month helpers cross year boundaries', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2025-11', 3), '2026-02');
  assert.equal(monthLabel('2025-09'), 'Sep 2025');
});

const opts = { monthOf: (r) => r.m, psfOf: (r) => r.v, stratumOf: (r) => r.k };
const many = (count, rec) => Array.from({ length: count }, () => ({ ...rec }));

test('rolling series pools each month with the two before it and leaves thin months as gaps', () => {
  const recs = [
    // 2025-07 and 2025-08 sit before the window but feed its first point
    ...many(3, { m: '2025-07', v: 500, k: 'a' }),
    ...many(3, { m: '2025-08', v: 600, k: 'a' }),
    ...many(3, { m: '2025-09', v: 700, k: 'a' }),
  ];
  const s = rollingPsfSeries(WINDOW, recs, opts);
  assert.equal(s.length, 12);
  assert.deepEqual(s.map((p) => p.month), WINDOW, 'points run oldest to newest');
  assert.equal(s[0].n, 9);
  assert.equal(s[0].psf, 600, 'Sep 2025 pools Jul, Aug and Sep');
  assert.equal(s[1].psf, 650);
  assert.equal(s[2].psf, 700, 'three sales in one stratum is enough');
  assert.equal(s[3].psf, null, 'an empty pool is a gap, not a point drawn from nothing');
});

test('a shift towards newer flats does not show up as a price rise', () => {
  // The Toa Payoh pattern: old flats hold at $600 psf and new flats at $900,
  // but new flats go from a quarter of sales to three quarters.
  const recs = [];
  for (const [i, month] of ['2025-07', '2025-08', ...WINDOW].entries()) {
    const newShare = i < 7 ? 1 : 3;
    recs.push(...many(4 - newShare, { m: month, v: 600, k: 'old' }), ...many(newShare, { m: month, v: 900, k: 'new' }));
  }
  const s = rollingPsfSeries(WINDOW, recs, { ...opts, minStratum: 1 });
  const change = seriesChange(s);
  assert.equal(Math.round(change.pct * 10) / 10, 0, `like-for-like prices were flat but the line moved ${change.pct}%`);
});

test('strata too thin to price are dropped, and a point without enough coverage is a gap', () => {
  const recs = [];
  for (const month of ['2025-07', '2025-08', ...WINDOW]) recs.push(...many(3, { m: month, v: 600, k: 'common' }));
  recs.push(...many(2, { m: '2026-08', v: 5000, k: 'rare' }));
  const s = rollingPsfSeries(WINDOW, recs, opts);
  assert.equal(s[11].psf, 600, 'two outliers in their own stratum must not move the point');
  const sparse = rollingPsfSeries(WINDOW, [...many(3, { m: '2026-08', v: 600, k: 'a' }), ...many(9, { m: '2026-01', v: 600, k: 'b' })], opts);
  assert.equal(sparse[11].psf, null, 'a point covering only a quarter of the year\'s sales is not drawn');
});

test('the line is scaled to the card\'s median psf so the two agree', () => {
  const recs = [];
  for (const [i, month] of ['2025-07', '2025-08', ...WINDOW].entries()) recs.push(...many(5, { m: month, v: 500 + i * 10, k: 'a' }));
  const s = rollingPsfSeries(WINDOW, recs, { ...opts, level: 588 });
  const mean = s.reduce((a, p) => a + p.psf, 0) / s.length;
  assert.ok(Math.abs(mean - 588) < 1e-9);
  assert.ok(s[11].psf > s[0].psf, 'scaling keeps the direction');
  assert.equal(leaseBand('2019'), '2018+');
  assert.equal(leaseBand(1978), '<1980');
});

const PRIOR = WINDOW.map((m) => shiftMonth(m, -12));

test('year-on-year change compares each group with itself, not the sales mix', () => {
  // Old flats $600 -> $612 (+2%), new flats $900 -> $918 (+2%), but new flats
  // go from 10% to 50% of sales. A plain median comparison would show a jump.
  const recs = [
    ...PRIOR.flatMap((m) => [...many(9, { m, v: 600, k: 'old' }), ...many(1, { m, v: 900, k: 'new' })]),
    ...WINDOW.flatMap((m) => [...many(5, { m, v: 612, k: 'old' }), ...many(5, { m, v: 918, k: 'new' })]),
  ];
  const pct = likeForLikeChange(WINDOW, PRIOR, recs, opts);
  assert.equal(Math.round(pct * 100) / 100, 2);
});

test('year-on-year change is null when too little of this year can be compared', () => {
  const recs = [
    ...PRIOR.flatMap((m) => many(1, { m, v: 600, k: 'old' })),
    ...WINDOW.flatMap((m) => [...many(1, { m, v: 612, k: 'old' }), ...many(3, { m, v: 900, k: 'new-only-this-year' })]),
  ];
  assert.equal(likeForLikeChange(WINDOW, PRIOR, recs, opts), null, 'a group with no prior-year sales cannot be compared');
});

test('no chart is drawn from fewer than six points', () => {
  const values = [600, 610, 620, 630, 640, null, null, null, null, null, null, null];
  assert.equal(trendSvg(flatSeries(values)), '');
  assert.equal(seriesChange(flatSeries(values)), null);
});

test('the chart axis never magnifies a small move into a cliff', () => {
  const svg = trendSvg(flatSeries([590, 592, 588, 591, 595, 597, 596, 586, 585, 590, 587, 588]));
  const labels = [...svg.matchAll(/text-anchor="end">\$([\d,]+)</g)].map((m) => Number(m[1].replace(/,/g, '')));
  const span = Math.max(...labels) - Math.min(...labels);
  assert.ok(span >= 590 * MIN_SPAN * 0.99, `axis spans only $${span} for a ~$590 psf market`);
  // every plotted coordinate stays inside the drawing
  const coords = [...svg.matchAll(/class="vc-line" d="([^"]+)"/g)][0][1].match(/-?[\d.]+/g).map(Number);
  for (let i = 0; i < coords.length; i += 2) {
    assert.ok(coords[i] >= 0 && coords[i] <= 320, `x ${coords[i]} outside the viewBox`);
    assert.ok(coords[i + 1] >= 0 && coords[i + 1] <= 150, `y ${coords[i + 1]} outside the viewBox`);
  }
});

test('the line breaks at a gap instead of bridging it', () => {
  const svg = trendSvg(flatSeries([600, 610, 620, 630, null, 640, 650, 660, 670, 680, 690, 700]));
  const d = svg.match(/class="vc-line" d="([^"]+)"/)[1];
  assert.equal((d.match(/M/g) || []).length, 2);
  assert.match(svg, /<title id="vc-t">Price per square foot, like for like, Sep 2025 to Aug 2026/);
});

test('card rounds the range, signs the change and handles a missing prior year', () => {
  const html = valueCardHtml({
    heading: 'Typical HDB resale price in Testville',
    prices: [400000, 450250, 500000, 551999, 600000],
    med: 500000,
    psf: 588.4,
    n: 5,
    yoy: -2.345,
    latestFullMonth: '2026-08',
    scope: 'all flat types',
    series: flatSeries([600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 612]),
    mixNote: 'Weighted to the year’s mix.',
  });
  assert.match(html, /data-vc-median>\$500,000</);
  assert.match(html, /between <strong>\$450,000<\/strong> and <strong>\$552,000<\/strong>/);
  assert.match(html, /<dd class="down">−2\.3%<\/dd>/);
  assert.match(html, /<dd>\$588<\/dd>/);
  assert.match(html, /<strong>Up 2\.0%<\/strong> like for like between Sep 2025 and Aug 2026\. Weighted to the year’s mix\./);

  const noPrior = valueCardHtml({
    heading: 'x', prices: [1, 2, 3], med: 2, psf: 1, n: 3, yoy: null, latestFullMonth: '2026-08', scope: 'x', series: [],
  });
  assert.match(noPrior, /<dt>Year on year, like for like<\/dt><dd>—<\/dd>/);
  assert.doesNotMatch(noPrior, /<svg/, 'no chart without enough data');
});

function ldNodes(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .flatMap((b) => (Array.isArray(b['@graph']) ? b['@graph'] : [b]));
}

function dataPages() {
  const pages = [];
  for (const dir of ['hdb-prices', 'condo-prices']) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}/index.html`;
      if (entry.isDirectory() && fs.existsSync(path.join(ROOT, file))) pages.push(file);
    }
  }
  return pages;
}

test('every town and district page leads with one value card that matches its FAQ markup', () => {
  const pages = dataPages();
  assert.ok(pages.length >= 50, `expected the town and district pages, found ${pages.length}`);
  for (const file of pages) {
    const html = read(file);
    assert.equal((html.match(/data-jt-value-card/g) || []).length, 1, `${file}: expected exactly one value card`);
    assert.doesNotMatch(html, /class="stat-band"/, `${file}: the old stat band should be gone`);
    const cardMedian = html.match(/data-vc-median>(\$[\d,]+)</)[1];
    const faq = ldNodes(html).find((n) => n['@type'] === 'FAQPage');
    const answer = faq.mainEntity[0].acceptedAnswer.text;
    assert.ok(answer.includes(`is ${cardMedian},`), `${file}: card says ${cardMedian} but the FAQ says "${answer}"`);
    // The card's year-on-year figure and the FAQ answer must be the same number.
    const cardYoy = html.match(/<dt>Year on year, like for like<\/dt><dd[^>]*>([^<]*)</)[1];
    const yoyAnswer = faq.mainEntity[2].acceptedAnswer.text;
    if (cardYoy === '—') {
      assert.match(yoyAnswer, /isn't enough data/, `${file}: card has no change but the FAQ gives one`);
    } else {
      const [, sign, num] = cardYoy.match(/^([+−])([\d.]+)%$/);
      assert.ok(yoyAnswer.includes(`${sign === '+' ? 'risen' : 'fallen'} ${num}%`), `${file}: card says ${cardYoy} but the FAQ says "${yoyAnswer}"`);
      assert.match(yoyAnswer, /^Like for like/, `${file}: FAQ year-on-year answer must say it is like for like`);
    }
    const card = html.slice(html.indexOf('data-jt-value-card'), html.indexOf('</section>', html.indexOf('data-jt-value-card')));
    if (card.includes('<svg')) assert.match(card, /role="img" aria-labelledby="vc-t"/, `${file}: chart has no text alternative`);
  }
});

const FURNITURE = read('scripts/apply-page-furniture.mjs');
const STEPS = [...FURNITURE.matchAll(/'(apply-[a-z-]+\.mjs)'/g)].map((m) => m[1]);

test('apply-page-furniture runs every shared furniture script, consent banner after tracking', () => {
  const check = JSON.parse(read('package.json')).scripts.check;
  for (const name of ['site-header', 'mobile-header', 'site-footer', 'conversion-tracking', 'consent-banner', 'self-hosted-fonts']) {
    assert.ok(check.includes(`check:${name}`), `npm run check no longer checks ${name}; update this test`);
    assert.ok(STEPS.includes(`apply-${name}.mjs`), `apply-page-furniture.mjs skips apply-${name}.mjs`);
  }
  assert.ok(
    STEPS.indexOf('apply-conversion-tracking.mjs') < STEPS.indexOf('apply-consent-banner.mjs'),
    'the consent banner must run after conversion tracking or it is left stale',
  );
});

for (const [workflow, generator] of [
  ['refresh-estate-pages.yml', 'generate-estate-pages.mjs'],
  ['refresh-condo-pages.yml', 'generate-condo-pages.mjs'],
]) {
  test(`${workflow} re-applies all page furniture between generating and committing`, () => {
    const yml = read(`.github/workflows/${workflow}`);
    const gen = yml.indexOf(`node scripts/${generator}`);
    const furniture = yml.indexOf('node scripts/apply-page-furniture.mjs');
    const commit = yml.indexOf('git commit');
    assert.notEqual(gen, -1);
    assert.ok(furniture > gen, `${workflow} must run apply-page-furniture.mjs after the generator`);
    assert.ok(furniture < commit, `${workflow} must run apply-page-furniture.mjs before committing`);
    assert.doesNotMatch(yml, /node scripts\/apply-(site-header|consent-banner|conversion-tracking)\.mjs/, `${workflow}: call apply-page-furniture.mjs, not a hand-picked subset`);
  });
}
