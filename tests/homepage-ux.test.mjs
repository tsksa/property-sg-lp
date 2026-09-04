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

test('only the primary homepage navigation is fixed', () => {
  const homepage = read('index.html');

  assert.match(homepage, /\.site-nav\{position:fixed;/);
  assert.doesNotMatch(homepage, /(?:^|\n)nav\{position:fixed;/);
  assert.match(homepage, /<nav class="site-nav" aria-label="Primary">/);
  assert.match(homepage, /<nav class="jt-sf" data-jt-site-footer/);

  const footerRule = homepage.match(/\.jt-sf\{([^}]*)\}/)?.[1] ?? '';
  assert.doesNotMatch(footerRule, /position\s*:\s*fixed/);
});

test('mobile navigation state is scoped to the primary header', () => {
  const homepage = read('index.html');

  assert.match(homepage, /\.site-nav \.nav-links\.open\{display:flex\}/);
  assert.match(homepage, /body\.mobile-nav-open\{overflow:hidden\}/);
  assert.match(homepage, /body\.mobile-nav-open \.cookie-banner\.show\{visibility:hidden;pointer-events:none\}/);
  assert.match(homepage, /\.site-nav \.nav-links\{display:none;position:absolute;top:100%;right:0;left:0;height:calc\(100dvh - 100% - 3px\);/);
  assert.match(homepage, /document\.body\.classList\.toggle\('mobile-nav-open',open\)/);
  assert.match(homepage, /if\(e\.key==='Escape'\)\{\s*setNav\(false,true\)/);
  assert.match(homepage, /if\(e\.key==='Tab'\)\{/);
  assert.match(homepage, /mobileNavQuery\.addEventListener\('change',e=>\{if\(!e\.matches\)setNav\(false\);\}\)/);
  assert.match(homepage, /<span class="dark-toggle-label">'\+\(isDark\?'Light mode':'Dark mode'\)\+'<\/span>/);
  assert.match(homepage, /e\.target\.closest\('\.site-nav'\)/);
  assert.match(homepage, /document\.querySelector\('\.site-nav'\)/);
  assert.doesNotMatch(homepage, /e\.target\.closest\('nav'\)/);
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

test('homepage navigation aligns with the Joe authority page', () => {
  const homepage = read('index.html');
  const profile = read('about-joe/index.html');

  assert.match(
    homepage,
    /<a class="logo" href="\/">\s*<span class="logo-name">Joe Tay<\/span><span class="logo-brand">PropertySG<\/span>\s*<\/a>/,
  );
  for (const label of ['Valuation', 'Insights', 'Sell with Joe']) {
    assert.ok(homepage.includes(`>${label}</a>`), `homepage is missing ${label}`);
    assert.ok(profile.includes(`>${label}</a>`), `profile is missing ${label}`);
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
