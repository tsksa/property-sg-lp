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

  assert.match(
    html,
    /<ul class="blog-grid" aria-label="Insight articles">/,
  );
  assert.equal((html.match(/<li>/g) || []).length, 4);
  assert.equal((html.match(/<\/li>/g) || []).length, 4);
  assert.doesNotMatch(html, /<a[^>]+role="listitem"/);
});

test('insights footer links are distinguishable without relying on colour', () => {
  const css = read('insights/blog.css');

  assert.match(
    css,
    /\.blog-footer a\{[^}]*text-decoration:underline[^}]*\}/,
  );
});

test('calculator and insights skip links stay hidden until keyboard focus', () => {
  for (const file of ['calculator/index.html', 'insights/blog.css']) {
    const source = read(file);

    assert.match(
      source,
      /\.skip-to-content\{[^}]*left:-9999px[^}]*overflow:hidden[^}]*\}/,
    );
    assert.match(
      source,
      /\.skip-to-content:focus\{[^}]*position:fixed[^}]*background:var\(--emerald-aa\)[^}]*\}/,
    );
  }
});
