import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { hdbPolicyArticle, policySources } from '../scripts/content/hdb-policy-august-2026.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const slug = hdbPolicyArticle.slug;
const html = read(`insights/${slug}.html`);
const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map(match => JSON.parse(match[1]));

test('policy article preserves separate HDB, singles, extended-family and EC limits', () => {
  for (const value of ['$16,000', '$8,000', '$24,000', '$18,000', '24 August 2026']) {
    assert.ok(html.includes(value), `missing ${value}`);
  }
  assert.ok(html.includes('each family nucleus at most $16,000'));
  assert.ok(html.includes('land sale tender closes on or after 24 August 2026'));
  assert.ok(html.includes('Balance units in existing EC projects'));
  assert.ok(html.includes('not all HDB purchases'));
});

test('HFE transition advice preserves both no-action and new-assessment-period conditions', () => {
  assert.ok(html.includes('no action is required solely'));
  assert.ok(html.includes('if no flat application has been submitted'));
  assert.ok(html.includes('Pre-24 August application still processing'));
  assert.ok(html.includes('fresh application also changes the income-assessment period'));
  assert.ok(html.includes(policySources.annexB));
  const hfe = read('insights/hfe-letter-singapore-guide.html');
  assert.ok(hfe.includes('have not submitted a flat application'));
  assert.ok(hfe.includes('new income-assessment period'));
});

test('future ballot changes and unchanged EHG rules are not presented as immediate loan benefits', () => {
  for (const value of ['February 2027', 'November 2026', '25 September 2026', '$9,000', '$4,500', '75%', '30% MSR']) {
    assert.ok(html.includes(value), `missing ${value}`);
  }
  assert.ok(html.includes('not a November 2026 benefit'));
  assert.ok(html.includes('not a rate cut'));
  assert.ok(html.includes('not individual approval predictions'));
});

test('resale guide removes superseded ceilings and preserves separate EHG rules', () => {
  const resale = read('insights/hdb-resale-grants-singapore.html');
  assert.ok(!resale.includes('generally $14,000 for a family household and $7,000'));
  assert.ok(resale.includes('$16,000 for a family'));
  assert.ok(resale.includes('$8,000 for an eligible single buying alone'));
  assert.ok(resale.includes('24 August 2026'));
  const ehg = read('insights/enhanced-cpf-housing-grant-singapore.html');
  assert.ok(ehg.includes('$9,000') && ehg.includes('$4,500'));
  assert.ok(ehg.includes('do not raise the separate EHG limits'));
});

test('calculator visibly separates financial estimates from income-ceiling eligibility', () => {
  const calculator = read('calculator/index.html');
  const note = calculator.match(/<p class="calc-policy-note" id="hdbPolicyUpdate">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(note, 'missing always-visible policy note');
  assert.ok(note.includes('does not check income-ceiling eligibility or grant/loan approval'));
  assert.ok(note.includes('$18,000 ceiling is for qualifying new ECs'));
  assert.ok(calculator.includes('.calc-policy-note a{text-decoration:underline'));
  assert.ok(!/id="income"[^>]*max=/.test(calculator), 'do not impose HDB eligibility limits on bank financing or hypothetical estimates');
});

test('policy article has consistent metadata, visible FAQs and discovery links', () => {
  const article = schemas.find(schema => schema['@type'] === 'Article');
  assert.equal(article.datePublished, '2026-08-26');
  assert.equal(article.dateModified, '2026-08-26');
  assert.equal(article.mainEntityOfPage, `https://joetay.com/insights/${slug}.html`);
  const faq = schemas.find(schema => schema['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, hdbPolicyArticle.faqs.length);
  for (const item of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${item.name}</h3>`));
    assert.ok(html.includes(`<p>${item.acceptedAnswer.text}</p>`));
  }
  for (const file of ['insights/index.html', 'calculator/index.html', 'insights/feed.json', 'insights/feed.xml', 'sitemap.xml', 'llms.txt']) {
    assert.ok(read(file).includes(slug), `${file} missing article discovery link`);
  }
});

test('wait-out clarification does not imply every HDB seller must wait 30 months', () => {
  const mop = read('insights/selling-hdb-after-mop-singapore.html');
  assert.ok(!mop.includes("you'll trigger the <strong>30-month waiting period</strong>"));
  assert.ok(mop.includes('does not by itself trigger a blanket 30-month wait'));
  assert.ok(mop.includes(policySources.waitOut));
  assert.ok(html.includes('did <strong>not</strong> remove the 30-month private-property disposal requirement'));
});
