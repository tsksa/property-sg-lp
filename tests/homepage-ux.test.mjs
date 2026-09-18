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

  assert.match(homepage, /<form class="hero-consult" id="heroForm"[^>]*novalidate hidden>/);
  for (const id of ['hero-name-error', 'hero-phone-error', 'hero-proptype-error']) {
    assert.match(homepage, new RegExp(`id="${id}" hidden>`));
  }
  assert.match(homepage, /id="heroValidation" role="alert" aria-live="assertive"/);
  assert.match(homepage, /function renderHeroValidation\(focusFirst=false\)/);
  assert.match(homepage, /setAttribute\('aria-invalid',valid\?'false':'true'\)/);
  assert.match(homepage, /if\(!renderHeroValidation\(true\)\)\{/);
  assert.match(homepage, /jtTrackLeadFormStage\(heroForm,'validation_error'/);
});

test('the hero leads with the sold-prices lookup and keeps the consultation one click away', () => {
  const homepage = read('index.html');
  const card = homepage.match(/<div class="hero-form hero-card" id="heroCard">[\s\S]*?<\/form>\n    <\/div>/)?.[0] ?? '';
  assert.ok(card, 'hero card missing');

  // Estimate first: a postal-code form that works without JavaScript by
  // falling back to the full sold-prices page, and no contact field before it.
  assert.match(card, /data-jt-estimate data-context="home"/);
  assert.match(card, /<h2 class="jte-heading" id="heroEstimateTitle">What did flats in your block sell for\?<\/h2>/);
  assert.match(card, /<form class="jte-form" action="\/neighbour-prices\/" method="get"/);
  assert.match(card, /id="heroPostal" name="postal"[^>]*inputmode="numeric"[^>]*autocomplete="postal-code"/);
  assert.ok(card.indexOf('id="heroPostal"') < card.indexOf('id="hero-name"'), 'postal code must come before the name field');

  // Consultation: still the same tracked form, hidden until asked for.
  assert.match(card, /<form class="hero-consult" id="heroForm"[^>]*hidden>/);
  assert.match(card, /class="cta-submit">Get Free Consultation/);
  assert.match(card, /id="heroTalkLink">Rather talk to Joe first\?/);
  assert.match(card, /id="heroBackToEstimate">[\s\S]*Back to sold prices<\/button>/);
  assert.match(homepage, /heroEstimate\.addEventListener\('jte:valuation'/);
  assert.match(homepage, /<script type="module" src="\/assets\/block-estimate\.js"><\/script>/);
  assert.match(homepage, /<link rel="stylesheet" href="\/assets\/block-estimate\.css">/);
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
