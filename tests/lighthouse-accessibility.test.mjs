import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Lighthouse keeps contrast and accessibility as hard failures', () => {
  const config = JSON.parse(read('.github/lighthouse-config.json'));
  const assertions = config.ci.assert.assertions;

  assert.deepEqual(assertions['categories:accessibility'], [
    'error',
    { minScore: 0.9 },
  ]);
  assert.deepEqual(assertions['color-contrast'], [
    'error',
    { minScore: 0.9 },
  ]);
});

test('external browser findings remain visible without keeping CI permanently red', () => {
  const config = JSON.parse(read('.github/lighthouse-config.json'));
  const assertions = config.ci.assert.assertions;

  for (const audit of [
    'inspector-issues',
    'legacy-javascript-insight',
    'third-party-cookies',
  ]) {
    assert.deepEqual(assertions[audit], ['warn', {}]);
  }
});

test('honeypots stay out of the accessibility tree and keyboard order', () => {
  for (const file of ['index.html', 'valuation.html']) {
    const html = read(file);
    const honeypot = html.match(
      /<input[^>]+(?:honeypot|val-honey)[^>]*>/,
    )?.[0];

    assert.ok(honeypot, `${file}: missing honeypot`);
    assert.match(honeypot, /tabindex="-1"/);
    assert.match(honeypot, /aria-hidden="true"/);
  }
});

test('visible mobile and cookie labels are included in their accessible names', () => {
  const html = read('index.html');

  assert.match(
    html,
    /class="mb-call" aria-label="Call Joe \+65 8188 1488"/,
  );
  assert.match(
    html,
    /id="cookieDecline" aria-label="No thanks — decline non-essential cookies">No thanks</,
  );
});

test('insight cards use semantic list markup without invalid link roles', () => {
  const html = read('insights/index.html');

  // Scope the count to the card list. Counting <li> across the whole document
  // made this fail the moment any other list was added to the page — the shared
  // site footer is a <ul> of section links — which says nothing about whether
  // the insight cards are marked up correctly. Mirrors the glossary test below.
  const list = html.match(
    /<ul class="blog-grid" aria-label="Insight articles">([\s\S]*?)<\/ul>/,
  )?.[1];
  const expectedCards = JSON.parse(read('insights/feed.json')).items.length;

  assert.ok(list, 'missing insight card list');
  assert.equal((list.match(/<li>/g) || []).length, expectedCards);
  assert.equal((list.match(/<\/li>/g) || []).length, expectedCards);
  assert.doesNotMatch(html, /<a[^>]+role="listitem"/);
});

test('glossary quick jumps use semantic list markup without invalid link roles', () => {
  const html = read('glossary/index.html');
  const list = html.match(
    /<ul class="g-toc-grid" aria-label="Glossary table of contents">([\s\S]*?)<\/ul>/,
  )?.[1];

  assert.ok(list, 'missing glossary table-of-contents list');
  assert.equal((list.match(/<li>/g) || []).length, 18);
  assert.equal((list.match(/<\/li>/g) || []).length, 18);
  assert.doesNotMatch(list, /<a[^>]+role="listitem"/);
});

test('new-launch cards use semantic list markup without invalid link roles', () => {
  const html = read('new-launches/index.html');
  const data = JSON.parse(read('new-launches/projects.json'));
  const activeCount = data.projects.filter(({ status }) => status !== 'sold-out').length;
  const list = html.match(
    /<ul[^>]+class="nl-grid reveal-stagger"[^>]+aria-label="Singapore new launch projects">([\s\S]*?)<\/ul>/,
  )?.[1];

  assert.ok(list, 'missing new-launch project list');
  assert.equal((list.match(/<li class="nl-card-item"/g) || []).length, activeCount);
  assert.equal((list.match(/<\/li>/g) || []).length, activeCount);
  assert.equal((list.match(/class="nl-card"/g) || []).length, activeCount);
  assert.doesNotMatch(list, /<a[^>]+role="listitem"/);
});

test('new-launch catalog controls have explicit labels and live feedback', () => {
  const html = read('new-launches/index.html');
  for (const id of ['nlCatalogSearch', 'nlStatusFilter', 'nlRegionFilter', 'nlTypeFilter', 'nlTenureFilter', 'nlSort']) {
    assert.match(html, new RegExp(`<label[^>]*>[\\s\\S]*?<[^>]+id="${id}"`));
  }
  assert.match(html, /id="nlFilterStatus"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /id="nlEmptyState"[^>]+hidden/);
});

test('insights footer links are distinguishable without relying on colour', () => {
  const css = read('insights/blog.css');

  assert.match(
    css,
    /\.blog-footer a\{[^}]*text-decoration:underline[^}]*\}/,
  );
});

test('calculator and insights expose one skip link that appears on focus', () => {
  for (const file of ['calculator/index.html', 'insights/index.html']) {
    const html = read(file);
    const skipLinks =
      html.match(/<a\b(?=[^>]*\bhref="#main")[^>]*>/g) || [];

    assert.equal(skipLinks.length, 1, `${file}: expected one skip link`);
    assert.match(
      html,
      /\.skip-link\{[^}]*left:-9999px[^}]*\}/,
    );
    assert.match(
      html,
      /\.skip-link:focus\{[^}]*left:0[^}]*\}/,
    );
  }
});
