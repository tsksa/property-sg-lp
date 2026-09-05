import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function publishedHtmlFiles(dir = ROOT) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['.git', '.claude', 'node_modules', 'tests'].includes(entry.name)) return [];
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return publishedHtmlFiles(absolute);
    return entry.name.endsWith('.html') ? [absolute] : [];
  });
}

test('the authority page identifies Joe and exposes independently verifiable credentials', () => {
  const page = read('about-joe/index.html');

  assert.match(page, /"@type": "ProfilePage"/);
  assert.match(page, /"name": "Joe Tay"/);
  assert.match(page, /"identifier": "R009618D"/);
  assert.match(page, /propertyportal\.era\.com\.sg\/agent\/detail\/R009618D/);
  assert.match(page, /propertyguru\.com\.sg\/agent\/joe-tay-80979/);
  assert.match(page, /href="https:\/\/www\.cea\.gov\.sg\/aceas\/public-register\/ea"/);
});

test('the authority page presents review-derived client stories without promising results', () => {
  const page = read('about-joe/index.html');
  const homepage = read('index.html');

  assert.match(page, /id="client-stories"/);
  assert.match(page, /not independently audited results or a promise of the same outcome/);
  assert.match(page, /Mr Ng[\s\S]*S\$18,000 above HDB valuation/);
  assert.match(page, /previous condo client[\s\S]*siblings marketing their parent’s HDB flat/);
  assert.match(page, /Joseph and Karen[\s\S]*Persistence, frequent communication and honest feedback/);
  assert.match(page, /no exact timing or price was published/);
  assert.match(page, /no rental amount or timing was published/);
  assert.match(homepage, /href="\/about-joe\/#client-stories">Read three client-reported property journeys<\/a>/);
});

test('HomeLah is absent from the published HTML and legacy URLs redirect internally', () => {
  const offenders = publishedHtmlFiles()
    .filter((file) => /homelah/i.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file));

  assert.deepEqual(offenders, []);
  const redirects = read('_redirects');
  assert.match(redirects, /^\/agents\/ \/about-joe\/ 301!$/m);
  assert.match(redirects, /^\/autopilot\/ \/calculator\/ 301!$/m);
});

test('search and AI discovery surfaces publish the authority page, not the legacy agent page', () => {
  const sitemap = read('sitemap.xml');
  const llms = read('llms.txt');
  const homepage = read('index.html');

  assert.match(sitemap, /<loc>https:\/\/joetay\.com\/about-joe\/<\/loc>/);
  assert.doesNotMatch(sitemap, /joetay\.com\/(agents|autopilot)\//);
  assert.match(llms, /\[About Joe Tay[^\]]*\]\(https:\/\/joetay\.com\/about-joe\/\)/);
  assert.doesNotMatch(llms, /HomeLah|joetay\.com\/agents\//i);
  assert.match(homepage, /href="\/about-joe\/">About Joe<\/a>/);
  assert.doesNotMatch(homepage, /href="\/agents\//);
});
