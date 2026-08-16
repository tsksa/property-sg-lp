#!/usr/bin/env node
// Refreshes the "New launches near <town>" block on already-generated
// /hdb-prices/<town>/ pages from the current new-launches/projects.json,
// without needing network access to data.gov.sg (generate-estate-pages.mjs's
// full regenerate does, since it also refreshes the price data).
//
//   node scripts/patch-new-launches-block.mjs          # patch / refresh
//   node scripts/patch-new-launches-block.mjs --check  # fail if any page is stale
//
// Idempotent: replaces an existing block in place, or inserts one in the right
// slot (between "Nearby towns" and "Useful reading for … sellers") if the town
// has no launches today but gains one later. Removes the block entirely if a
// town that had launches has none anymore (matches newLaunchesBlock() returning '').

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { newLaunchesBlock, projectsByDistrictFromFile } from './lib/estate-linking.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const projectsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'projects.json'), 'utf8'));
const projectsByDistrict = projectsByDistrictFromFile(projectsJson);

const towns = fs
  .readdirSync(path.join(ROOT, 'hdb-prices'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

// Matches the block as emitted by newLaunchesBlock(): its own <h2> up to (but
// not including) the next <h2>. Safe because every block on this page starts
// with a top-level <h2>.
const blockRe = /  <h2>New launches near [^<]*<\/h2>\n  <ul class="link-list">[\s\S]*?<\/ul>\n?/;

const missing = [];
const stale = [];
let written = 0;

for (const slug of towns) {
  const rel = path.join('hdb-prices', slug, 'index.html');
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');

  const h1Match = html.match(/<h1>([^<]*) HDB resale prices<\/h1>/);
  if (!h1Match) {
    missing.push(`${rel} (no <h1>… HDB resale prices</h1> to read the town title from)`);
    continue;
  }
  const townTitle = h1Match[1];

  const freshBlock = newLaunchesBlock(slug, townTitle, projectsByDistrict, esc);
  const had = blockRe.test(html);

  let patched;
  if (had) {
    patched = freshBlock
      ? html.replace(blockRe, `${freshBlock}\n`)
      : html.replace(blockRe, '');
  } else if (freshBlock) {
    // Insert right after the "Nearby towns" block's closing </div>, or — if a
    // town has no nearby-towns block either — right before "Useful reading for".
    const nearbyEndRe = /(  <h2>Nearby towns<\/h2>\n  <div class="town-grid">[\s\S]*?<\/div>\n)/;
    const readingRe = /(  <h2>Useful reading for )/;
    if (nearbyEndRe.test(html)) {
      patched = html.replace(nearbyEndRe, `$1${freshBlock}\n`);
    } else if (readingRe.test(html)) {
      patched = html.replace(readingRe, `${freshBlock}\n$1`);
    } else {
      missing.push(`${rel} (no anchor to insert the new-launches block at)`);
      continue;
    }
  } else {
    continue; // no block before, none now — nothing to do
  }

  if (patched === html) continue;

  if (checkOnly) {
    stale.push(rel);
  } else {
    fs.writeFileSync(file, patched);
    written += 1;
  }
}

if (checkOnly) {
  for (const rel of missing) console.error(`::error file=${rel}::${rel} could not be checked`);
  for (const rel of stale) console.error(`::error file=${rel}::new-launches block is stale — run node scripts/patch-new-launches-block.mjs`);
  if (missing.length || stale.length) {
    console.error(`${missing.length + stale.length} page(s) need node scripts/patch-new-launches-block.mjs`);
    process.exit(1);
  }
  console.log(`New-launches block current on ${towns.length} town pages`);
} else {
  console.log(`Patched ${written} page(s); ${towns.length - written} already current`);
}
