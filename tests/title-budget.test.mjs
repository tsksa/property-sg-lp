import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Search results truncate titles at roughly 60 characters. Measured 2026-09-07,
// 43 of 108 indexable pages ran past that — every HDB town page, the glossary,
// the launch catalog — so the brand suffix and often the town or district name
// were cut off in the SERP. This pins the budget and the one shared suffix.
//
// Exempt on purpose:
//   - sell/, rent-out/, sell-hdb/singapore/ are Google Ads landers whose titles
//     match the ad copy; they are never retitled with organic pages, so neither
//     rule applies to them.
//   - index.html is brand-first ("PropertySG | ..."), so the suffix is redundant.
//   - the commission article is the best-ranking page on the site (position
//     26.5) and keeps the exact title Google already ranks.
const BUDGET = 60;
const SUFFIX = ' | PropertySG';
const AD_LANDERS = new Set([
  'sell/index.html',
  'rent-out/index.html',
  'sell-hdb/singapore/index.html',
]);
const NO_SUFFIX = new Set([
  'index.html',
  'insights/property-agent-commission-singapore.html',
]);
const SKIP_DIRS = /^(node_modules|\.git|\.claude|tests|scripts|netlify|\.github|assets|js)(\/|$)/;

function* htmlFiles(dir = ROOT) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (SKIP_DIRS.test(rel)) continue;
    if (entry.isDirectory()) yield* htmlFiles(abs);
    else if (entry.name.endsWith('.html')) yield rel;
  }
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

const pages = [];
for (const rel of htmlFiles()) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/<meta name="robots"[^>]*noindex/.test(html)) continue;
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  pages.push({ rel, title: title === undefined ? undefined : decode(title) });
}

test('scans the whole indexable site', () => {
  assert.ok(pages.length >= 100, `only ${pages.length} indexable pages found`);
});

for (const { rel, title } of pages) {
  if (AD_LANDERS.has(rel)) continue;
  test(`${rel}: title fits the ${BUDGET}-character search budget`, () => {
    assert.ok(title, 'missing <title>');
    assert.ok(
      title.length <= BUDGET,
      `${title.length} chars: "${title}"`,
    );
  });

  if (NO_SUFFIX.has(rel)) continue;
  test(`${rel}: title ends with the shared brand suffix`, () => {
    assert.ok(title.endsWith(SUFFIX), `"${title}" does not end with "${SUFFIX}"`);
    assert.doesNotMatch(title, /\| Joe Tay$/);
  });
}
