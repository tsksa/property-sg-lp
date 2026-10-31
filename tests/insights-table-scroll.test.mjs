import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dir = new URL('../insights/', import.meta.url);
const pages = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

// A table with four or more columns is wider than a 375px phone and, unwrapped,
// makes the whole article scroll sideways (seen on the mega-launches and EC
// articles). Such tables must sit in their own horizontal scroll region.
const WRAPPER = /<div (?:class="[^"]*\b(?:table-scroll|table-wrap|decision-table-wrap)\b[^"]*"|[^>]*style="[^"]*overflow-x:\s*auto)[^>]*>\s*$/;

function firstRowColumns(table) {
  const row = (table.match(/<tr[\s\S]*?<\/tr>/) || [''])[0];
  return (row.match(/<t[hd][\s>]/g) || []).length;
}

test('insights tables with four or more columns scroll inside their own region', () => {
  const unwrapped = [];
  for (const page of pages) {
    const html = fs.readFileSync(new URL(page, dir), 'utf8');
    for (const match of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
      if (firstRowColumns(match[0]) < 4) continue;
      const before = html.slice(Math.max(0, match.index - 400), match.index);
      if (!WRAPPER.test(before)) unwrapped.push(`${page}: ${match[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(unwrapped, []);
});

test('the mega-launches and EC articles use focusable, labelled scroll regions', () => {
  for (const page of ['singapore-mega-launches-2027.html', 'ec-vs-private-condo-2027.html']) {
    const html = fs.readFileSync(new URL(page, dir), 'utf8');
    const tables = html.match(/<table\b/g).length;
    const regions = html.match(/<div class="table-scroll" role="region" aria-label="[^"]+" tabindex="0" style="overflow-x:auto">\s*<table\b/g) || [];
    assert.equal(regions.length, tables, page);
  }
});
