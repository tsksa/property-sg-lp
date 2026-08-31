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

test('all four audited hub families load the shared assets', () => {
  for (const rel of [
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
