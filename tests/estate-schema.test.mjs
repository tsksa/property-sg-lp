import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTownSchema, buildHubSchema } from '../scripts/lib/estate-schema.mjs';

// The Dataset/FAQPage JSON-LD must only ever restate numbers already rendered
// on the page — see scripts/generate-estate-pages.mjs stat-band. These tests
// pin that the builder derives its text from the same inputs, not invented
// figures, and that it degrades sensibly when there's no prior-year window.

const DATASET = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const API = 'https://data.gov.sg/api/action/datastore_search';
const window12 = ['2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11', '2025-10', '2025-09', '2025-08'];

test('town Dataset carries the exact stat-band numbers, not rounded/rederived ones', () => {
  const [dataset] = buildTownSchema({
    t: 'Ang Mo Kio',
    canonical: 'https://joetay.com/hdb-prices/ang-mo-kio/',
    generatedAt: '2026-07',
    window12,
    cur: { med: 517500, n: 892, psf: 585.4 },
    yoy: 5.6,
    DATASET,
    API,
  });
  assert.equal(dataset['@type'], 'Dataset');
  assert.equal(dataset.temporalCoverage, '2025-08/2026-07');
  const byName = Object.fromEntries(dataset.variableMeasured.map((v) => [v.name, v.value]));
  assert.equal(byName['Median resale price'], 517500);
  assert.equal(byName['Median price per square foot'], 585); // rounded, same as the page's $585 psf
  assert.equal(byName['Transaction count'], 892);
});

test('town FAQPage answers quote the same numbers as the Dataset', () => {
  const [, faq] = buildTownSchema({
    t: 'Bedok',
    canonical: 'https://joetay.com/hdb-prices/bedok/',
    generatedAt: '2026-07',
    window12,
    cur: { med: 545400, n: 1224, psf: 589 },
    yoy: -2.8,
    DATASET,
    API,
  });
  assert.equal(faq['@type'], 'FAQPage');
  assert.equal(faq.mainEntity.length, 3);
  const priceAnswer = faq.mainEntity[0].acceptedAnswer.text;
  assert.match(priceAnswer, /\$545,400/); // exact formatted median, not re-rounded
  assert.match(priceAnswer, /1224/);
  const yoyAnswer = faq.mainEntity[2].acceptedAnswer.text;
  assert.match(yoyAnswer, /fallen 2\.8%/);
});

test('a null YoY (insufficient prior-window data) never fabricates a percentage', () => {
  const [, faq] = buildTownSchema({
    t: 'Bukit Timah',
    canonical: 'https://joetay.com/hdb-prices/bukit-timah/',
    generatedAt: '2026-07',
    window12,
    cur: { med: 990000, n: 57, psf: 825 },
    yoy: null,
    DATASET,
    API,
  });
  const yoyAnswer = faq.mainEntity[2].acceptedAnswer.text;
  assert.doesNotMatch(yoyAnswer, /%/);
  assert.match(yoyAnswer, /not enough data|isn't enough data/);
});

test('hub schema identifies the actual highest/lowest median from indexRows, not a hardcoded town', () => {
  const indexRows = [
    { town: 'Ang Mo Kio', s: 'ang-mo-kio', med: 517500, n: 892 },
    { town: 'Bukit Timah', s: 'bukit-timah', med: 990000, n: 57 },
    { town: 'Woodlands', s: 'woodlands', med: 400000, n: 1786 },
  ];
  const [dataset, faq] = buildHubSchema({
    canonical: 'https://joetay.com/hdb-prices/',
    generatedAt: '2026-07',
    indexRows,
    DATASET,
    API,
  });
  const byName = Object.fromEntries(dataset.variableMeasured.map((v) => [v.name, v.value]));
  assert.equal(byName['Town count'], 3);
  assert.equal(byName['Total 12-month transaction count'], 892 + 57 + 1786);

  const highestQ = faq.mainEntity.find((q) => /highest/.test(q.name));
  const lowestQ = faq.mainEntity.find((q) => /lowest/.test(q.name));
  assert.match(highestQ.acceptedAnswer.text, /Bukit Timah/);
  assert.match(lowestQ.acceptedAnswer.text, /Woodlands/);
});

// Google requires FAQPage content to be visible on the page; JSON-LD-only Q&A
// risks a manual action for spammy structured data. The generator renders the
// visible block from the same node it serialises, so this pins that faqHtml
// reproduces every question and answer verbatim.
test('faqHtml renders every schema question and answer verbatim', async () => {
  const { faqHtml } = await import('../scripts/lib/estate-schema.mjs');
  const esc = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const [, faq] = buildTownSchema({
    t: 'Tampines',
    canonical: 'https://joetay.com/hdb-prices/tampines/',
    generatedAt: '2026-07',
    window12: ['2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02',
      '2026-01', '2025-12', '2025-11', '2025-10', '2025-09', '2025-08'],
    cur: { med: 545400, psf: 585, n: 1224 },
    yoy: -2.8,
    DATASET,
    API,
  });

  const html = faqHtml(faq, esc);
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(esc(q.name)), `question not rendered: ${q.name}`);
    assert.ok(html.includes(esc(q.acceptedAnswer.text)), `answer not rendered: ${q.name}`);
  }
  assert.equal((html.match(/<details/g) || []).length, faq.mainEntity.length);
});
