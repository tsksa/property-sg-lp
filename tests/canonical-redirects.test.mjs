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
    assert.ok(read(to.slice(1)).includes(`rel="canonical" href="https://joetay.com${to}"`), to);
  }
  assert.match(read('netlify.toml'), /\[build\.processing\.html\]\s+pretty_urls = false/);
});

test('generation preserves legacy rules, is idempotent and excludes directory and external URLs', () => {
  const xml = '<loc>https://joetay.com/valuation.html</loc><loc>https://joetay.com/calculator/</loc><loc>https://elsewhere.example/page.html</loc>';
  const existing = '/old /new/ 301!\n/api/* /.netlify/functions/:splat 200\n';
  assert.deepEqual(canonicalAliasRules(xml), [{from:'/valuation',to:'/valuation.html'}]);
  const generated = updateRedirects(existing, xml);
  assert.ok(generated.startsWith(existing));
  assert.match(generated, /\/valuation \/valuation\.html 301!/);
  assert.equal(updateRedirects(generated, xml), generated);
});
