import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { mobileHeaderAssetsHtml, MOBILE_HEADER_MARKER } from '../scripts/lib/mobile-header.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = fs.readFileSync(path.join(ROOT, 'assets/mobile-header.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/mobile-header.css'), 'utf8');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('the shared mobile menu exposes every core destination', () => {
  for (const [href, label] of [
    ['/valuation.html', 'Valuation'],
    ['/neighbour-prices/', 'Sold Prices'],
    ['/new-launches/', 'New Launches'],
    ['/calculator/', 'Calculator'],
    ['/stamp-duty-calculator/', 'Stamp Duty'],
    ['/about-joe/', 'About Joe'],
    ['/insights/', 'Insights'],
  ]) {
    assert.ok(js.includes(`['${href}', '${label}']`), `shared menu is missing ${label}`);
  }
});

test('the hub families and the homepage load the shared assets', () => {
  for (const rel of [
    'index.html',
    'new-launches/index.html',
    'neighbour-prices/index.html',
    'insights/index.html',
    'calculator/index.html',
  ]) {
    const html = read(rel);
    assert.ok(html.includes(MOBILE_HEADER_MARKER), `${rel} is missing shared mobile-header assets`);
    assert.ok(html.includes(mobileHeaderAssetsHtml()), `${rel} has stale shared mobile-header assets`);
  }
});

test('the menu preserves keyboard, focus, breakpoint and consent behavior', () => {
  assert.match(js, /menu\.querySelector\('a\[href\]'\)\?\.focus\(\)/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /event\.key !== 'Tab'/);
  assert.match(js, /MOBILE_QUERY\.addEventListener\('change'/);
  assert.match(js, /document\.body\.classList\.toggle\('jt-mobile-nav-open', open\)/);
  assert.match(css, /body\.jt-mobile-nav-open\{overflow:hidden\}/);
  assert.match(css, /body\.jt-mobile-nav-open \.jt-cb\.show/);
});

test('mobile controls and destinations retain comfortable touch targets', () => {
  assert.match(css, /\.jt-mh-toggle\{[^}]*width:44px;height:44px/);
  assert.match(css, /\.jt-mh-context-cta\{[^}]*min-height:44px!important/);
  assert.match(css, /\.jt-mh-panel a\{[^}]*min-height:44px/);
});

test('the internal header carries the Joe Tay and PropertySG authority lockup', () => {
  assert.match(js, /jt-mh-logo-name\">Joe Tay/);
  assert.match(js, /jt-mh-logo-brand\">PropertySG/);
});

test('phones get a bottom WhatsApp and Call bar on guides, price pages and tools', () => {
  for (const prefix of ['/hdb-prices/', '/condo-prices/', '/insights/', '/calculator/', '/about-joe/']) {
    assert.ok(js.includes(`'${prefix}'`), `contact bar does not cover ${prefix}`);
  }
  // Pages with their own bottom bar are left alone.
  assert.match(js, /document\.querySelector\('\.mobile-bar,\.nl-mobile-cta,\.lp-wa-float'\)\) return/);
  // The call number is the one the shared footer already shows; the WhatsApp
  // link is the header's, so the two can never disagree.
  const footer = read('scripts/lib/site-footer.mjs');
  const tel = js.match(/CONTACT_BAR_TEL = '(tel:\+\d+)'/)?.[1];
  assert.ok(tel && footer.includes(`href="${tel}"`), 'contact bar number differs from the footer number');
  assert.match(js, /whatsapp\.href = headerCta\.href/);
  // Shown after the first scroll, hidden while typing and while the menu is open.
  assert.match(js, /window\.scrollY < 80/);
  assert.match(js, /fieldFocused = Boolean\(event\.target\.matches && event\.target\.matches\(TEXT_FIELD\)\)/);
  assert.match(css, /body\.jt-mobile-nav-open \.jt-bb:not\(\[hidden\]\)\{display:none\}/);
});

test('the bottom bar is phone-only, tappable, and lifts the consent banner clear', () => {
  assert.match(css, /\.jt-bb\{display:none\}/);
  assert.match(css, /@media\(max-width:768px\)\{\s*\.jt-bb:not\(\[hidden\]\)\{display:flex;position:fixed/);
  assert.match(css, /\.jt-bb a\{[^}]*min-height:48px/);
  assert.match(css, /body\.jt-bb-on \.jt-cb,body\.jt-bb-on \.back-to-top\{bottom:calc\(76px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(css, /body\.jt-bb-on\{padding-bottom:calc\(64px \+ env\(safe-area-inset-bottom\)\)\}/);
});
