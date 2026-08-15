#!/usr/bin/env node
// Generates /llms.txt — the entry point AI crawlers and answer engines read to
// find the site's citable material.
//
// Built from sitemap.xml plus each page's own <title>, so it cannot drift from
// what is actually published. Run with --check in CI to fail on staleness.
//
//   node scripts/generate-llms-txt.mjs          # write llms.txt
//   node scripts/generate-llms-txt.mjs --check  # verify it is current

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APEX = 'https://joetay.com/';
const OUT = path.join(ROOT, 'llms.txt');
const checkOnly = process.argv.includes('--check');

// Section order is deliberate: the data-backed clusters lead, because those are
// the pages worth citing. Anything not matched here lands in "Other pages".
const SECTIONS = [
  ['HDB resale prices by town', (p) => p.startsWith('hdb-prices/')],
  ['New launch projects', (p) => p.startsWith('new-launches/')],
  ['Guides and insights', (p) => p.startsWith('insights/')],
  ['Tools', (p) => ['valuation.html', 'calculator/', 'stamp-duty-calculator/', 'neighbour-prices/', 'glossary/'].includes(p)],
  ['Services', (p) => ['sell/', 'rent-out/', 'agents/'].includes(p)],
];

const urls = [...fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1])
  .filter((u) => u.startsWith(APEX));

const decodeEntities = (value) =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');

// Resolve a published URL back to the file that produced it, so the link text can
// use the page's real title rather than a slug guess.
function titleFor(url) {
  const rel = url.slice(APEX.length);
  const candidates = rel === '' ? ['index.html'] : [rel, path.join(rel, 'index.html')];
  for (const candidate of candidates) {
    const file = path.join(ROOT, candidate);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
    const title = fs.readFileSync(file, 'utf8').match(/<title>([^<]*)<\/title>/)?.[1];
    // Titles are HTML-escaped in source; llms.txt is plain text, so decode them.
    if (title) return decodeEntities(title).replace(/\s*\|\s*PropertySG\s*$/, '').trim();
  }
  return null;
}

const entries = urls.map((url) => ({ url, rel: url.slice(APEX.length), title: titleFor(url) }));
const missing = entries.filter((e) => !e.title);
if (missing.length) {
  for (const e of missing) console.error(`::error::no <title> resolved for ${e.url}`);
  process.exit(1);
}

const lines = [
  '# PropertySG — joetay.com',
  '',
  '> Singapore residential property advisory run by Joe Tay, a CEA-registered salesperson',
  '> with ERA Realty Network. The site publishes data-backed HDB resale prices for all 26',
  '> HDB towns, verified new-launch project records, and buyer/seller guides. Price figures',
  '> derive from the official data.gov.sg HDB resale dataset under the Singapore Open Data',
  '> Licence; each project record carries the date it was last verified.',
  '',
  '## Contact',
  '',
  `- [Free property valuation](${APEX}valuation.html): postal-code lookup and a same-day indicative valuation.`,
  '- WhatsApp: https://wa.me/6581881488',
  '',
];

const claimed = new Set();
for (const [heading, match] of SECTIONS) {
  const section = entries.filter((e) => match(e.rel));
  if (!section.length) continue;
  section.forEach((e) => claimed.add(e.url));
  lines.push(`## ${heading}`, '');
  for (const e of section) lines.push(`- [${e.title}](${e.url})`);
  lines.push('');
}

const rest = entries.filter((e) => !claimed.has(e.url));
if (rest.length) {
  lines.push('## Other pages', '');
  for (const e of rest) lines.push(`- [${e.title}](${e.url})`);
  lines.push('');
}

const output = `${lines.join('\n').trimEnd()}\n`;

if (checkOnly) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== output) {
    console.error('::error file=llms.txt::llms.txt is stale — run `node scripts/generate-llms-txt.mjs`');
    process.exit(1);
  }
  console.log(`llms.txt is current — ${entries.length} URLs`);
} else {
  fs.writeFileSync(OUT, output);
  console.log(`Wrote llms.txt — ${entries.length} URLs`);
}
