import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { injectToc, slugifyHeading } from '../scripts/lib/article-toc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSIGHTS = path.join(ROOT, 'insights');

const wrap = (body) => `<html><section class="article-body" aria-labelledby="article-title">\n${body}</section><footer><h2>Find your number</h2></footer></html>`;

test('slugs are stable, ascii and bounded', () => {
  assert.equal(slugifyHeading('HDB loan vs bank loan: a 2026 comparison'), 'hdb-loan-vs-bank-loan-a-2026-comparison');
  assert.equal(slugifyHeading('Cash, CPF &amp; grants'), 'cash-cpf-and-grants');
  assert.ok(slugifyHeading('x'.repeat(200)).length <= 60);
});

test('injectToc adds ids only where missing, keeps existing ids, and is idempotent', () => {
  const html = wrap('<h2>First step</h2><p>a</p><h2 id="keep-me">Second</h2><p>b</p><h2>First step</h2><p>c</p>');
  const once = injectToc(html);
  assert.match(once, /<nav class="article-toc" data-jt-article-toc aria-labelledby="article-toc-title">/);
  assert.match(once, /<h2 id="first-step">First step<\/h2>/);
  assert.match(once, /<h2 id="keep-me">Second<\/h2>/);
  assert.match(once, /<h2 id="first-step-2">First step<\/h2>/);
  assert.match(once, /<a href="#keep-me">Second<\/a>/);
  assert.doesNotMatch(once, /Find your number<\/a>/, 'footer headings must not enter the TOC');
  assert.equal(injectToc(once), once);
});

test('injectToc leaves short articles and non-articles alone', () => {
  const short = wrap('<h2>Only</h2><p>a</p><h2>Two</h2>');
  assert.doesNotMatch(injectToc(short), /article-toc/);
  assert.equal(injectToc('<html><body><h2>No article body</h2></body></html>'), '<html><body><h2>No article body</h2></body></html>');
});

test('every insight article carries a TOC whose links resolve to its own H2 ids', () => {
  for (const file of fs.readdirSync(INSIGHTS)) {
    if (!file.endsWith('.html') || file === 'index.html') continue;
    const html = fs.readFileSync(path.join(INSIGHTS, file), 'utf8');
    const toc = html.match(/<nav class="article-toc"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(toc, `${file}: missing TOC`);
    const links = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(links.length >= 3, `${file}: TOC too short`);
    for (const id of links) assert.ok(html.includes(`<h2 id="${id}"`), `${file}: TOC link #${id} has no H2`);
    assert.equal(injectToc(html), html, `${file}: TOC is stale — run npm run apply:article-toc`);
  }
});
