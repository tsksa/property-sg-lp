#!/usr/bin/env node
// Keeps the HDB-town / condo-district link block current on the pages listed
// in PRICE_LINK_TARGETS (scripts/lib/price-links.mjs).
//
//   node scripts/apply-price-links.mjs          # inject / refresh
//   node scripts/apply-price-links.mjs --check  # fail if any block is missing or stale
//
// Idempotent: an existing block is replaced in place, so this can run after
// every estate or condo regeneration. A new or retired town or district page
// changes the lists, and --check then flags the pages to refresh (JOE-448).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRICE_LINK_TARGETS, PRICE_LINKS_RE, applyPriceLinks } from './lib/price-links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const problems = [];
let written = 0;

for (const target of PRICE_LINK_TARGETS) {
  const file = path.join(ROOT, target.file);
  const html = fs.readFileSync(file, 'utf8');
  let patched;
  try {
    patched = applyPriceLinks(html, target, ROOT);
  } catch (error) {
    problems.push(error.message);
    continue;
  }
  if (patched === html) continue;
  if (checkOnly) {
    problems.push(`${target.file}: price links block is ${PRICE_LINKS_RE.test(html) ? 'stale' : 'missing'}`);
    continue;
  }
  fs.writeFileSync(file, patched);
  written += 1;
}

if (problems.length) {
  for (const problem of problems) console.error(`::error::${problem}`);
  if (checkOnly) console.error('Run: node scripts/apply-price-links.mjs');
  process.exit(1);
}

console.log(
  checkOnly
    ? `Price links block present and current on ${PRICE_LINK_TARGETS.length} pages`
    : `Price links block: ${written} page(s) updated, ${PRICE_LINK_TARGETS.length} checked`,
);
