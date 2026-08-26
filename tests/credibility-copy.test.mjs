import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const pages = [
  'index.html',
  'about-joe/index.html',
  'sell/index.html',
  'rent-out/index.html',
  'insights/hdb-valuation-explained.html',
  'insights/selling-hdb-after-mop-singapore.html',
];
const schemas = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]));
const plainText = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

test('cleaned pages omit unsupported totals, ratings and response promises', () => {
  for (const page of pages) {
    const html = read(page);
    assert.doesNotMatch(html, /500\+|\$200M\+|4\.9(?:\/5|★)|5\.0\/5|★★★★★|18k above/i, page);
    assert.doesNotMatch(html, /(?:under|within|in)\s+(?:10|1)\s*(?:min(?:utes)?|hour)\b|10-min reply|15.day average|15–30 day process/i, page);
    assert.doesNotMatch(html, /PDPA Compliant|Verified reviews|Verified landlord/i, page);
  }
});

test('JSON-LD remains valid without self-serving review or aggregate rating markup', () => {
  for (const page of pages) {
    const data = schemas(read(page));
    assert.ok(data.length > 0, `${page}: missing structured data`);
    assert.doesNotMatch(JSON.stringify(data), /"(?:aggregateRating|review|reviewRating)"|"@type":"(?:Review|AggregateRating)"/, page);
  }
  const business = schemas(read('index.html')).find((item) => item['@type'] === 'RealEstateAgent');
  assert.equal(business.founder.hasCredential.identifier, 'R009618D');
  assert.equal(business.memberOf.identifier, 'L3002382K');
  assert.equal(business.telephone, '+65-8188-1488');
});

test('timing and response FAQs match the visible homepage answers', () => {
  const html = read('index.html');
  const faq = schemas(html).find((item) => item['@type'] === 'FAQPage');
  for (const [question, id] of [
    ['How long does it take to sell or rent?', 'faq-answer-2'],
    ['How fast do you reply?', 'faq-answer-11'],
  ]) {
    const answer = html.match(new RegExp(`id="${id}"[^>]*><p>([\\s\\S]*?)<\\/p>`))?.[1];
    assert.ok(answer, `Missing visible answer: ${question}`);
    assert.equal(faq.mainEntity.find((item) => item.name === question).acceptedAnswer.text, plainText(answer));
  }
});

test('review summaries are labelled and link to their independent sources', () => {
  const html = read('index.html');
  const cards = [...html.matchAll(/<div class="testi-card\b[^"]*"[^>]*>([\s\S]*?)(?=<div class="testi-card\b|<\/div>\s*<p class="testi-note)/g)];
  assert.equal(cards.length, 2);
  for (const [, card] of cards) {
    assert.match(card, /Review summary:/);
    assert.match(card, /href="https:\/\/(?:www\.propertyguru\.com\.sg\/agent\/joe-tay-80979|propertyportal\.era\.com\.sg\/agent\/detail\/R009618D)"/);
    assert.doesNotMatch(card, /<blockquote|testi-stars|Verified/);
  }
  for (const page of ['about-joe/index.html', 'rent-out/index.html']) {
    assert.match(read(page), /Review summary:/, page);
    assert.match(read(page), /Individual experience; results vary/, page);
  }
  // Summaries must not be made to look like verbatim quotations by CSS.
  assert.doesNotMatch(read('sell/ads-landing.css'), /\.lp-case-quote::(?:before|after)/);
  assert.doesNotMatch(html, /\.advisor-quote::before/);
  assert.doesNotMatch(html, /\.testi-card::before/);
});

test('service copy avoids unverified case results and explains negotiated fees', () => {
  const home = read('index.html');
  assert.doesNotMatch(home, /<section[^>]+class="(?:stats|recent-activity)"/);
  assert.doesNotMatch(home, /Mr Ng|Ms Lim|Mr Tan|Mrs Wong|under 8 weeks/i);
  const seller = read('sell/index.html');
  assert.match(seller, /quoted full-service seller fee is 2%/);
  assert.match(seller, /commission rates are negotiable, not fixed/);
  assert.doesNotMatch(seller, /industry standard|Standard Singapore rate|Cheaper agents typically/);
  const rental = read('rent-out/index.html');
  assert.match(rental, /Rental commission is negotiable/);
  assert.match(rental, /we agree whom I represent/);
  assert.match(rental, /href="https:\/\/www\.cea\.gov\.sg\/consumers\/engaging-a-property-agent\/renting-or-renting-out\//);
  assert.doesNotMatch(rental, /paid by the tenant|tenant pays|security deposit escrow/i);
});

test('canonical URLs, contact paths and lead forms are retained', () => {
  for (const page of pages) {
    const html = read(page);
    const route = page === 'index.html' ? '' : page.replace(/index\.html$/, '');
    assert.ok(html.includes(`rel="canonical" href="https://joetay.com/${route}"`), page);
    assert.match(html, /https:\/\/wa\.me\/6581881488/, page);
  }
  for (const [page, forms] of [
    ['index.html', ['heroForm']],
    ['sell/index.html', ['sellForm', 'sellFormFinal']],
    ['rent-out/index.html', ['rentForm', 'rentFormFinal']],
  ]) {
    const html = read(page);
    for (const id of forms) assert.match(html, new RegExp(`<form[^>]+id="${id}"`), page);
    assert.match(html, /\/\.netlify\/functions\/submit-lead/, page);
  }
});
