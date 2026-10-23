import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resaleCashReadiness } from '../assets/resale-cash-readiness.mjs';
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
    assert.ok(html.includes(slug === 'use-cpf-buy-hdb-flat-singapore' ? 'Reviewed 23 Oct 2026' : 'Reviewed 25 Aug 2026'));
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

test('CPF worked example reconciles the price and matches the cash-readiness calculator', () => {
  const html = read('insights/use-cpf-buy-hdb-flat-singapore.html');
  const table = id => {
    const body = html.match(new RegExp(`<table id="${id}"[\\s\\S]*?<tbody>([\\s\\S]*?)</tbody>`))?.[1];
    assert.ok(body, `${id} must be visible HTML`);
    return Object.fromEntries([...body.matchAll(/<th scope="row">([^<]+)<\/th><td>\$([\d,]+)<\/td>/g)]
      .map(([, label, amount]) => [label, Number(amount.replaceAll(',', ''))]));
  };
  const inputs = table('cpf-example-inputs');
  assert.equal(Object.keys(inputs).length, 7);
  const input = {
    price: inputs['Agreed purchase price'], valuation: inputs['HDB valuation'],
    loan: inputs['Confirmed loan amount to draw'], cpf: inputs['Usable CPF for the flat price'],
    deposit: inputs['Option/exercise deposit already paid'], cash: inputs['Cash available now'],
    reserve: inputs['Remaining costs and cash buffer'],
  };
  const result = resaleCashReadiness(input);
  const funding = table('cpf-example-funding');
  assert.equal(input.price, funding['Agreed purchase price']);
  assert.equal(input.valuation, funding['HDB valuation']);
  assert.equal(input.loan, funding['Confirmed HDB loan']);
  assert.equal(input.cpf, funding['Usable CPF for the price']);
  assert.equal(input.deposit, funding['Deposit already paid in cash']);
  assert.equal(input.loan, input.valuation * 0.75);
  assert.equal(input.cpf, (80000 - 20000) * 2);
  assert.equal(input.price, input.loan + input.cpf + funding['Cash for the full price']);
  assert.equal(result.cov, funding['Of that cash: COV'] * 100);
  assert.equal(result.cashForPrice, funding['Remaining cash for the price'] * 100);
  assert.equal(result.cashForPrice + result.deposit, funding['Cash for the full price'] * 100);
  assert.equal(result.cashRequired, 6000000);
  assert.equal(result.shortfall, 0);
  assert.equal(result.cashRemaining, 0);
  assert.match(html, /\$45,000 remaining for the price \+ \$15,000 reserve = \$60,000 cash needed from now/);
});

test('CPF example retains eligibility caveats and working calculator/source destinations', () => {
  const html = read('insights/use-cpf-buy-hdb-flat-singapore.html');
  for (const phrase of ['hypothetical purchase', 'youngest buyer to age 95', 'first HDB loan', 'No grants or CPF-funded fees', 'not a fee quote', 'does not determine CPF or loan eligibility', 'not an extra charge']) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.match(html, /href="\/calculator\/#resaleCashPanel"[^>]*data-calculator="resale_cash_readiness"[^>]*data-entry-point="cpf_guide"/);
  for (const id of ['resaleCashPanel', 'repaymentPanel']) assert.ok(read('calculator/index.html').includes(`id="${id}"`));
  for (const source of ['https://www.mynicehome.gov.sg/get-started/hdb-loans-guide/', 'https://www.cpf.gov.sg/member/tools-and-services/calculators/cpf-housing-usage', 'https://www.cpf.gov.sg/member/infohub/educational-resources/hdb-option-fee-and-housing-expenses-you-should-know']) {
    assert.ok(html.includes(`href="${source}"`));
  }
});

test('CPF review dates agree across visible copy, metadata and feeds without changing publication date', () => {
  const html = read('insights/use-cpf-buy-hdb-flat-singapore.html');
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map(match => JSON.parse(match[1]));
  const article = schemas.find(schema => schema['@type'] === 'Article');
  assert.equal(article.datePublished, '2026-08-25');
  assert.equal(article.dateModified, '2026-10-23');
  assert.match(html, /<time datetime="2026-10-23">Updated Oct 23, 2026<\/time>/);
  assert.match(html, /<meta property="article:modified_time" content="2026-10-23">/);
  const feed = JSON.parse(read('insights/feed.json')).items.find(item => item.id === article.mainEntityOfPage);
  assert.equal(feed.date_published, '2026-08-25T00:00:00+08:00');
  assert.equal(feed.date_modified, '2026-10-23T00:00:00+08:00');
  const entry = read('insights/feed.xml').match(/<entry>\s*<title>Using CPF to Buy an HDB Flat \(2026\)<\/title>[\s\S]*?<\/entry>/)?.[0];
  assert.ok(entry.includes(`<updated>${feed.date_modified}</updated>`));
  assert.ok(entry.includes(feed.summary));
  assert.ok(read('insights/index.html').includes(feed.summary));
});
