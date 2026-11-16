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
  ['Tools', (p) => ['valuation.html', 'calculator/', 'stamp-duty-calculator/', 'neighbour-prices/', 'glossary/', 'faq/', 'sell/guide/'].includes(p)],
  ['Services', (p) => ['sell/', 'sell-hdb/singapore/', 'rent-out/', 'buy/', 'rent/', 'about-joe/'].includes(p)],
  ['中文页面 (Simplified Chinese)', (p) => p.startsWith('zh/')],
];

// AUDIT.md A7: one-line answers to the questions people ask most, each quoted
// word for word from a guide's own FAQPage markup and linked to that guide. Only
// the question is listed here; the answer is read from the page, so it cannot
// drift from what the guide says, and --check fails if a guide changes it.
// Rules and process only: no market figures that date quickly, and nothing on
// commission or fees for Joe's own service.
const COMMON_QUESTIONS = [
  ['insights/how-long-to-sell-hdb-singapore-2026.html', 'Does selling an HDB flat take only eight weeks?'],
  ['insights/how-to-sell-hdb-flat-singapore.html', 'When do I receive the money from selling my HDB flat?'],
  ['insights/hdb-valuation-explained.html', 'How much does an HDB valuation cost, and who pays?'],
  ['insights/selling-hdb-after-mop-singapore.html', 'When does the 5-year MOP start?'],
  ['insights/seller-stamp-duty-singapore.html', 'How much is Seller’s Stamp Duty in Singapore?'],
  ['insights/how-to-sell-condo-singapore.html', 'Do I need to meet an MOP before selling a private condo?'],
  ['insights/renting-out-hdb-condo-singapore.html', 'Can I rent out my whole HDB flat?'],
  ['insights/15-month-wait-out-removed-private-owners-hdb.html', 'Has the 15-month wait-out period been removed?'],
  ['insights/hdb-income-ceiling-2026-ndr-changes.html', 'Is the HDB income ceiling $18,000 in 2026?'],
  ['insights/hdb-loan-eligibility-singapore.html', 'Do I need an HFE letter for a resale HDB flat?'],
  ['insights/msr-vs-tdsr-singapore.html', 'What is the MSR limit in Singapore?'],
  ['insights/hdb-resale-grants-singapore.html', 'How much HDB resale grant can a family receive?'],
];

function faqAnswer(rel, question) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node['@type'] === 'Question' && node.name === question) found.push(node.acceptedAnswer?.text);
    Object.values(node).forEach(walk);
  };
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) walk(JSON.parse(json));
  if (found.length !== 1 || typeof found[0] !== 'string') {
    console.error(`::error file=${rel}::llms.txt common question not found exactly once in the FAQPage markup: "${question}"`);
    process.exit(1);
  }
  return found[0].replace(/\s+/g, ' ').trim();
}

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
  // Only registration facts a reader can verify; no sales counts, ratings or
  // years-of-experience claims here.
  '## About Joe Tay',
  '',
  '- Joe Tay is a CEA-registered salesperson, registration no. R009618D.',
  '- Agency: ERA Realty Network Pte Ltd, Agency Lic. No. L3002382K.',
  '- Verify the registration: CEA Public Register, https://eservices.cea.gov.sg/aceas/public-register/',
  `- Services: [selling an HDB flat](${APEX}sell-hdb/singapore/), [selling a property](${APEX}sell/), [renting out a property](${APEX}rent-out/) and [indicative valuations](${APEX}valuation.html).`,
  `- Profile and contact: [About Joe](${APEX}about-joe/). Commission is negotiable in Singapore; see the [property agent commission guide](${APEX}insights/property-agent-commission-singapore.html).`,
  '',
  '## Common questions',
  '',
  '> Each answer is quoted word for word from the linked guide; see the guide for the official sources.',
  '',
  ...COMMON_QUESTIONS.map(([rel, question]) => {
    const title = titleFor(`${APEX}${rel}`);
    return `- ${question} ${faqAnswer(rel, question)} ([${title}](${APEX}${rel}))`;
  }),
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
