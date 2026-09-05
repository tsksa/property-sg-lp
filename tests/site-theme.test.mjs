import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const KEY_PAGES = [
  'index.html',
  'valuation.html',
  'calculator/index.html',
  'bto-calculator/index.html',
  'stamp-duty-calculator/index.html',
  'insights/index.html',
  'new-launches/index.html',
  'about-joe/index.html',
];

test('key journeys load the same theme assets', () => {
  for (const page of KEY_PAGES) {
    const html = read(page);
    assert.match(html, /<link rel="stylesheet" href="\/assets\/site-theme\.css">/, page);
    assert.match(html, /<script src="\/assets\/site-theme\.js"><\/script>/, page);
  }
});

test('theme preference is applied before content and synchronized across controls', () => {
  const js = read('assets/site-theme.js');
  assert.match(js, /localStorage\.getItem\(STORAGE_KEY\) === 'true'/);
  assert.match(js, /document\.documentElement\.classList\.toggle\(ROOT_CLASS, dark\)/);
  assert.match(js, /document\.body\?\.classList\.toggle\('dark-mode', dark\)/);
  assert.match(js, /aria-pressed/);
  assert.match(js, /Switch to light mode/);
  assert.match(js, /Switch to dark mode/);
  assert.match(js, /document\.querySelector\('\.jt-mh-panel'\)/);
});

test('homepage light mode has visibly light navigation and form surfaces', () => {
  const css = read('assets/site-theme.css');
  const homepage = read('index.html');
  assert.match(css, /html:not\(\.jt-theme-dark\) \.site-nav\{background:rgba\(250,246,236,\.96\)/);
  assert.match(css, /html:not\(\.jt-theme-dark\) \.hero-form\{background:rgba\(255,255,255,\.94\)/);
  assert.match(css, /html:not\(\.jt-theme-dark\) \.hero-form input/);
  assert.match(css, /html:not\(\.jt-theme-dark\) \.hero-valuation-link\{color:#43506a\}/);
  assert.match(css, /body:has\(\.cookie-banner\.show\) \.jt-theme-toggle\{opacity:1;visibility:visible;pointer-events:auto\}/);
  assert.match(homepage, /data-jt-theme-toggle/);
  assert.doesNotMatch(homepage, /const dt=document\.getElementById\('darkToggle'\)/);
});

test('internal page headers use the shared light treatment', () => {
  const css = read('assets/site-theme.css');
  assert.match(css, /html:not\(\.jt-theme-dark\) :is\(\.calc-topbar,\.topbar,\.blog-topbar,\.nl-topbar,\.nl-topbar\.scrolled,\.site-head\)\{background:rgba\(250,246,236,\.97\)/);
  for (const selector of ['.calc-nav', '.jt-hn', '.blog-nav', '.nl-nav', '.site-head .nav-links']) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
});

test('dark theme covers discovery, calculator and authority surfaces', () => {
  const css = read('assets/site-theme.css');
  for (const selector of ['.calc-hero', '.val-main', '.blog-hero', '.nl-hero', '.section:not(.final)']) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
  assert.match(css, /html\.jt-theme-dark main :is\(input,select,textarea\)/);
});
