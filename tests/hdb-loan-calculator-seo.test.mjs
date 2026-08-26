import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const stripTags = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replaceAll('&amp;', '&')
  .replaceAll('&#39;', "'")
  .replace(/\s+/g, ' ')
  .trim();

test('calculator targets HDB loan calculator search intent', () => {
  const html = read('calculator/index.html');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];

  assert.equal(title, 'HDB Loan Calculator Singapore (2026) | Joe Tay');
  assert.ok(title.length <= 60, `title is ${title.length} characters`);
  assert.ok(description.length <= 155, `description is ${description.length} characters`);
  assert.match(description, /HDB loan calculator/i);
  assert.match(description, /monthly repayment/i);
  assert.match(html, /<h1[^>]*>HDB loan calculator: estimate your monthly repayment<\/h1>/);
  assert.match(html, /independent planning estimate/i);
  assert.doesNotMatch(html, /official HDB loan calculator/i);
});

test('visible HDB FAQs exactly mirror FAQ structured data', () => {
  const html = read('calculator/index.html');
  const visible = stripTags(html);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
  const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');

  assert.ok(faq, 'missing FAQPage structured data');
  assert.equal(faq.mainEntity.length, 6);
  for (const entry of faq.mainEntity) {
    assert.ok(visible.includes(entry.name), `FAQ question is not visible: ${entry.name}`);
    assert.ok(visible.includes(entry.acceptedAnswer.text), `FAQ answer is not visible: ${entry.name}`);
  }
});

test('calculator addresses BTO and renovation queries without claiming unsupported capabilities', () => {
  const html = read('calculator/index.html');
  assert.match(html, /Can I use this HDB calculator for a BTO or resale flat\?/);
  assert.match(html, /does not calculate BTO staged payments, resale cash-over-valuation or your grant entitlement/);
  assert.match(html, /Is this an HDB renovation loan calculator\?/);
  assert.match(html, /No\. This page estimates home-purchase financing, not a renovation loan\./);
  assert.match(html, /href="\/insights\/property-agent-commission-singapore.html#buyer-agent-fees"/);
});

test('calculator cites current primary HDB guidance and its review date', () => {
  const html = read('calculator/index.html');

  assert.match(html, /Sources checked 25 August 2026/);
  assert.match(html, /https:\/\/www\.hdb\.gov\.sg\/managing-my-home\/finances\/loan-matters\/interest-rate/);
  assert.match(html, /https:\/\/www\.hdb\.gov\.sg\/buying-a-flat\/flat-grant-and-loan-eligibility\/housing-loan\/housing-loan-from-hdb/);
  assert.match(html, /current HDB concessionary interest rate is 2\.6% per year for 1 July to 30 September 2026/);
  assert.match(html, /published maximum loan-to-value limit is 75%/);
  assert.match(html, /not a loan offer/);
  assert.match(html, /Is this calculator the same as an HFE letter\?/i);
  assert.match(html, /No\. This calculator is an independent planning tool\./i);
});

test('relevant HDB pages link to the calculator with descriptive anchor text', () => {
  for (const relative of [
    'glossary/index.html',
    'insights/hdb-valuation-explained.html',
    'hdb-prices/index.html',
  ]) {
    const html = read(relative);
    assert.match(
      html,
      /<a[^>]+href="\/calculator\/"[^>]*>[^<]*HDB loan calculator[^<]*<\/a>/i,
      `missing descriptive calculator link in ${relative}`,
    );
  }
});
