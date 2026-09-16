#!/usr/bin/env node
// Refreshes new-launches/era-snapshot.json — the slow-moving facts the project
// pages render statically from ERA's public new-launch search.
//
//   node scripts/fetch-era-new-launches.mjs          # fetch and write
//   node scripts/fetch-era-new-launches.mjs --check  # fail if the snapshot is malformed
//
// Only static attributes are committed: the ERA listing link, unit types with
// their size ranges and unit counts, facility highlights, and expected TOP for
// projects that have actually launched. Prices, psf and availability are never
// written here — they are served live by netlify/functions/era-prices.js,
// because check-new-launches.mjs rejects committed dynamic figures older than
// 7 days. See netlify/functions/lib/era-launches.js for why ERA is treated as
// corroboration rather than truth.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { fetchEraProjects, summariseProject } = require('../netlify/functions/lib/era-launches.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = path.join(ROOT, 'new-launches', 'era-map.json');
const OUT_PATH = path.join(ROOT, 'new-launches', 'era-snapshot.json');
const checkOnly = process.argv.includes('--check');

function staticView(summary) {
  return {
    eraId: summary.eraId,
    detailUrl: summary.detailUrl,
    launched: summary.live,
    expectedTop: summary.expectedTop,
    unitTypes: summary.mix.map(({ type, minArea, maxArea, units }) => ({ type, minArea, maxArea, units })),
    facilities: summary.facilities,
  };
}

export function validateSnapshot(snapshot, map) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.fetchedAt || '')) errors.push('fetchedAt must be an ISO date');
  for (const slug of Object.keys(map.projects)) {
    const entry = snapshot.projects?.[slug];
    if (!entry) {
      errors.push(`${slug}: missing from snapshot`);
      continue;
    }
    if (entry.eraId !== String(map.projects[slug])) errors.push(`${slug}: eraId does not match era-map.json`);
    if (!entry.detailUrl?.startsWith('https://propertyportal.era.com.sg/new-launches/detail/')) errors.push(`${slug}: bad detailUrl`);
    for (const row of entry.unitTypes || []) {
      if ('minPrice' in row || 'available' in row) errors.push(`${slug}: dynamic figures must not be committed`);
    }
  }
  return errors;
}

async function main() {
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  if (checkOnly) {
    const snapshot = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    const errors = validateSnapshot(snapshot, map);
    if (errors.length) {
      for (const error of errors) console.error(`::error file=new-launches/era-snapshot.json::${error}`);
      process.exit(1);
    }
    console.log(`ERA snapshot: ${Object.keys(snapshot.projects).length} projects, fetched ${snapshot.fetchedAt}`);
    return;
  }

  const now = new Date();
  const projects = await fetchEraProjects();
  const byId = new Map(projects.map((project) => [String(project.id), project]));
  const out = { fetchedAt: now.toISOString().slice(0, 10), source: 'https://propertyportal.era.com.sg/new-launches', projects: {} };
  const missing = [];
  for (const [slug, eraId] of Object.entries(map.projects)) {
    const era = byId.get(String(eraId));
    if (!era) {
      missing.push(slug);
      continue;
    }
    out.projects[slug] = staticView(summariseProject(era, { now }));
  }
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`ERA snapshot: wrote ${Object.keys(out.projects).length} projects`);
  if (missing.length) console.warn(`No longer listed on ERA: ${missing.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
