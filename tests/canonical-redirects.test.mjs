import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { canonicalAliasRules, updateRedirects } from '../scripts/generate-canonical-redirects.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('every sitemap HTML alias redirects once to its existing canonical page', () => {
  const xml = read('sitemap.xml');
  const redirects = read('_redirects');
  const rules = canonicalAliasRules(xml);
  assert.ok(rules.length > 40);
  assert.equal(redirects, updateRedirects(redirects, xml));
  const targets = new Set(rules.map(rule => rule.to));
  for (const { from, to } of rules) {
    assert.ok(!targets.has(from), `redirect loop or chain: ${from}`);
    const file = to.endsWith('/') ? `${to.slice(1)}index.html` : to.slice(1);
    assert.ok(read(file).includes(`rel="canonical" href="https://joetay.com${to}"`), to);
    // Netlify ignores a trailing slash when matching, so /x -> /x/ would loop.
    assert.notEqual(from.replace(/\/$/, ''), to.replace(/\/$/, ''), `self-redirect: ${from}`);
  }
  for (const [from, to] of [['/index', '/'], ['/hdb-prices/bedok.html', '/hdb-prices/bedok/']]) {
    assert.ok(rules.some((rule) => rule.from === from && rule.to === to), `${from} -> ${to}`);
  }
  // A forced rule on a file Netlify serves for another URL risks a loop.
  for (const { from } of rules) assert.ok(!fs.existsSync(new URL(`..${from}`, import.meta.url)), `physical file: ${from}`);
  assert.match(read('netlify.toml'), /\[build\.processing\.html\]\s+pretty_urls = false/);
});

test('the netlify.app copies of the site redirect to joetay.com', () => {
  const toml = read('netlify.toml');
  for (const host of ['propertysg78.netlify.app', 'main--propertysg78.netlify.app']) {
    assert.match(toml, new RegExp(`from = "https://${host.replace(/[.-]/g, '\\$&')}/\\*"\\s+to = "https://joetay\\.com/:splat"\\s+status = 301\\s+force = true`), host);
  }
  // The function rewrite must come first, or form posts on those hosts would be redirected.
  assert.ok(toml.indexOf('from = "/api/*"') < toml.indexOf('propertysg78.netlify.app'));
});

test('generation preserves legacy rules, is idempotent and excludes external URLs', () => {
  const xml = '<loc>https://joetay.com/valuation.html</loc><loc>https://joetay.com/calculator/</loc><loc>https://joetay.com/</loc><loc>https://elsewhere.example/page.html</loc>';
  const existing = '/old /new/ 301!\n/api/* /.netlify/functions/:splat 200\n';
  const none = () => false;
  assert.deepEqual(canonicalAliasRules(xml, none), [
    { from: '/calculator.html', to: '/calculator/' },
    { from: '/index', to: '/' },
    { from: '/valuation', to: '/valuation.html' },
  ]);
  const generated = updateRedirects(existing, xml, none);
  assert.ok(generated.startsWith(existing));
  assert.match(generated, /\/valuation \/valuation\.html 301!/);
  assert.equal(updateRedirects(generated, xml, none), generated);
});

test('a real /x.html page is never redirected to a /x/ directory', () => {
  const xml = '<loc>https://joetay.com/guide/</loc>';
  assert.deepEqual(canonicalAliasRules(xml, (urlPath) => urlPath === '/guide.html'), []);
});
