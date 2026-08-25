import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const slugs = [
  'enhanced-cpf-housing-grant-singapore',
  'hdb-resale-grants-singapore',
  'use-cpf-buy-hdb-flat-singapore',
  'hdb-downpayment-cash-cpf-grants',
];

test('the four-article HDB grants cluster is indexable, sourced and conversion-linked', () => {
  for (const slug of slugs) {
    const html = read(`insights/${slug}.html`);
    assert.match(html, /<link rel="canonical" href="https:\/\/joetay\.com\/insights\//);
    assert.match(html, /<meta name="robots" content="index,follow/);
    assert.match(html, /Reviewed 25 Aug 2026/);
    assert.match(html, /href="\/calculator\/">HDB loan calculator<\/a>/);
    assert.match(html, /href="\/insights\/hfe-letter-singapore-guide\.html"|href="hfe-letter-singapore-guide\.html"/);
    assert.match(html, /https:\/\/(?:www\.)?(?:hdb\.gov\.sg|cpf\.gov\.sg)\//);
    assert.doesNotMatch(html, /guaranteed grant|guaranteed approval|personal financial advice tailored to you/i);
  }
});

test('visible grant FAQs exactly mirror FAQPage schema', () => {
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

test('hub, calculator, loan cluster, sitemap and feeds discover every grant guide', () => {
  const surfaces = [
    read('insights/index.html'), read('calculator/index.html'), read('sitemap.xml'),
    read('insights/feed.xml'), read('insights/feed.json'),
    read('insights/hdb-loan-eligibility-singapore.html'),
    read('insights/hfe-letter-singapore-guide.html'),
    read('insights/msr-vs-tdsr-singapore.html'),
    read('insights/hdb-loan-vs-bank-loan-singapore.html'),
  ];
  for (const slug of slugs) {
    for (const surface of surfaces) assert.ok(surface.includes(slug), `${slug} missing from a discovery surface`);
  }
});
