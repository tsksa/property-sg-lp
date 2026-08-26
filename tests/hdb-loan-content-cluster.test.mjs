import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const slugs = [
  'hdb-loan-eligibility-singapore',
  'hfe-letter-singapore-guide',
  'msr-vs-tdsr-singapore',
  'hdb-loan-vs-bank-loan-singapore',
  'hdb-income-ceiling-2026-ndr-changes',
];

test('the HDB loan and policy guides are indexable, sourced and calculator-linked', () => {
  for (const slug of slugs) {
    const html = read(`insights/${slug}.html`);
    assert.match(html, /<link rel="canonical" href="https:\/\/joetay\.com\/insights\//);
    assert.match(html, /<meta name="robots" content="index,follow/);
    assert.match(html, /Reviewed (25|26) Aug 2026/);
    assert.match(html, /href="\/calculator\/">HDB loan calculator<\/a>/);
    assert.match(html, /https:\/\/(?:www\.)?(?:hdb\.gov\.sg|cpf\.gov\.sg)\//);
    assert.doesNotMatch(html, /guaranteed approval|financial advice tailored to you/i);
  }
});

test('visible FAQs exactly mirror FAQPage schema', () => {
  for (const slug of slugs) {
    const html = read(`insights/${slug}.html`);
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map((match) => JSON.parse(match[1]));
    const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');
    assert.ok(faq, `${slug} missing FAQPage`);
    for (const entry of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${entry.name}</h3>`), `${slug} missing visible question: ${entry.name}`);
      assert.ok(html.includes(`<p>${entry.acceptedAnswer.text}</p>`), `${slug} missing visible answer: ${entry.name}`);
    }
  }
});

test('hub, calculator, sitemap and feeds discover the whole cluster', () => {
  const surfaces = [read('insights/index.html'), read('calculator/index.html'), read('sitemap.xml'), read('insights/feed.xml'), read('insights/feed.json')];
  for (const slug of slugs) {
    for (const surface of surfaces) assert.ok(surface.includes(slug), `${slug} missing from a discovery surface`);
  }
});
