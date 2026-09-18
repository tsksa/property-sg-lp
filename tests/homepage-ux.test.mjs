import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('Ms Lai review is first, sourced and consistent with its structured data', () => {
  const html = read('index.html');
  const card = html.match(/id="review-ms-lai">([\s\S]*?)<\/blockquote>/)?.[1];
  assert.ok(card);
  assert.match(card, /aria-label="5 out of 5 stars"/);
  const quote = card.match(/<blockquote>"([\s\S]*?)"$/)?.[1];
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
  const business = schemas.find(schema => Array.isArray(schema.review));
  assert.equal(business.review[0].author.name, 'Ms Lai');
  assert.equal(business.review[0].reviewBody, quote);
  assert.equal(business.review[0].datePublished, '2026-09-04');
  assert.equal(business.review[0].reviewRating.ratingValue, '5');
  assert.equal(business.aggregateRating.reviewCount, '7');
  assert.match(html, /Ms Lai<\/div>\s*<div class="testi-role">4 Sep 2026 · PropertyGuru review excerpt/);
  assert.match(html, /Joe confirmed the display name Ms Lai/);
  assert.equal(business.review[0].url, 'https://www.propertyguru.com.sg/agent/joe-tay-80979');
  assert.match(html, /\.testi-card\{transform:none!important\}/);
});

test('the homepage uses the shared sticky header and only the footer stays static', () => {
  const homepage = read('index.html');

  assert.match(homepage, /<header class="jt-sh" data-jt-site-header>/);
  assert.doesNotMatch(homepage, /\.site-nav\{|<nav class="site-nav"|id="navBurger"|mobile-nav-open|id="darkToggle"/);
  assert.doesNotMatch(homepage, /(?:^|\n)nav\{position:fixed;/);
  assert.match(homepage, /<nav class="jt-sf" data-jt-site-footer/);

  const footerRule = homepage.match(/\.jt-sf\{([^}]*)\}/)?.[1] ?? '';
  assert.doesNotMatch(footerRule, /position\s*:\s*fixed/);
});

test('mobile navigation and the theme toggle come from the shared assets', () => {
  const homepage = read('index.html');

  assert.match(homepage, /<link rel="stylesheet" href="\/assets\/mobile-header\.css" data-jt-mobile-header-assets>/);
  assert.match(homepage, /<script src="\/assets\/mobile-header\.js" defer data-jt-mobile-header-assets><\/script>/);
  assert.match(homepage, /<script src="\/assets\/site-theme\.js"><\/script>/);
  // The hero no longer pads for a fixed nav; the shared header is in flow.
  assert.match(homepage, /\.hero\{[^}]*padding:72px 32px 88px/);
});

test('homepage lead form provides persistent accessible field errors', () => {
  const homepage = read('index.html');

  assert.match(homepage, /<form class="hero-form" id="heroForm"[^>]*novalidate>/);
  for (const id of ['hero-name-error', 'hero-phone-error', 'hero-proptype-error']) {
    assert.match(homepage, new RegExp(`id="${id}" hidden>`));
  }
  assert.match(homepage, /id="heroValidation" role="alert" aria-live="assertive"/);
  assert.match(homepage, /function renderHeroValidation\(focusFirst=false\)/);
  assert.match(homepage, /setAttribute\('aria-invalid',valid\?'false':'true'\)/);
  assert.match(homepage, /if\(!renderHeroValidation\(true\)\)\{/);
  assert.match(homepage, /jtTrackLeadFormStage\(heroForm,'validation_error'/);
});

test('consultation stays primary while valuation is a quiet secondary action', () => {
  const homepage = read('index.html');

  assert.match(homepage, /class="cta-submit">Get Free Consultation/);
  assert.match(homepage, /Need a price estimate instead\? Get a free valuation/);
  assert.doesNotMatch(homepage, /hero-or-divider/);
});

test('homepage navigation is the same header the Joe authority page uses', () => {
  const header = (rel) => read(rel).match(/<header class="jt-sh" data-jt-site-header>[\s\S]*?<\/style>\s*<\/header>/)?.[0].replace(/ aria-current="page"/g, '');
  const homepage = header('index.html');
  assert.ok(homepage);
  assert.equal(header('about-joe/index.html'), homepage);
  assert.match(homepage, /<span class="jt-mh-logo-name">Joe Tay<\/span><span class="jt-mh-logo-brand">PropertySG<\/span>/);
  for (const label of ['Valuation', 'Insights', 'About Joe', 'WhatsApp Joe']) {
    assert.ok(homepage.includes(`>${label}</a>`), `header is missing ${label}`);
  }
});

test('mobile contact bar stays out of the hero enquiry path', () => {
  const homepage = read('index.html');

  assert.match(homepage, /class="mobile-bar mobile-bar--hero"/);
  assert.match(homepage, /mobileContactBar\.classList\.toggle\('mobile-bar--hero',entry\.isIntersecting\)/);
  assert.match(homepage, /\.mobile-bar\.mobile-bar--hero\{[^}]*visibility:hidden;pointer-events:none/);
});

test('hero form uses concise, privacy-forward reassurance', () => {
  const homepage = read('index.html');

  assert.match(homepage, /Direct reply from Joe · No obligation/);
  assert.match(homepage, /Spam-protected\. Your details stay private\./);
  assert.doesNotMatch(homepage, /Typically replies in under 10 min/);
});
