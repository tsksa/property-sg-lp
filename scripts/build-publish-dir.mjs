// Copies the public site, and nothing else, into the directory Netlify deploys
// (netlify.toml: publish = "_site").
//
// Why this exists (JOE-450): Netlify used to publish the repository root, so
// AGENTS.md, CLAUDE.md, package.json, linear-triage.csv, every build script,
// every test and the Netlify Functions source were public URLs. Forced 404s in
// _redirects did not close it: on the deploy preview /AGENTS.md returned 404 but
// /agents.md, /Scripts/... and /scripts%2F... still served the files, because
// redirect rules match case-sensitively while Netlify serves files
// case-insensitively. An allowlist copy means internal files are never uploaded.
//
// Add a new top-level page, folder or asset to SITE_ENTRIES or it will not be
// deployed. tests/private-tooling-not-published.test.mjs fails until every
// tracked top-level entry is classified as site or internal.
//
// Run: node scripts/build-publish-dir.mjs <out-dir>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Written into every directory this script builds, so a rerun may replace it.
// Dot-prefixed, so Netlify does not deploy it.
const MARKER = '.publish-dir';

export const SITE_ENTRIES = [
  '404.html', 'index.html', 'privacy-policy.html', 'valuation.html',
  '_redirects', 'humans.txt', 'llms.txt', 'robots.txt', 'sitemap.xml', 'site.webmanifest', 'sw.js',
  '.well-known', 'about-joe', 'assets', 'bto-calculator', 'calculator', 'condo-prices',
  'downloads', 'glossary', 'hdb-prices', 'img', 'insights', 'js', 'neighbour-prices',
  'new-launches', 'renovation-loan-calculator', 'rent-out', 'sell', 'sell-hdb',
  'stamp-duty-calculator', 'zh',
];
// Favicons, the social preview and Joe's portrait sit at the root.
export const SITE_ROOT_IMAGE = /^[\w.-]+\.(?:jpe?g|png|webp|ico|svg)$/;

export function siteEntries(root = ROOT) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => SITE_ENTRIES.includes(entry.name) || (entry.isFile() && SITE_ROOT_IMAGE.test(entry.name)))
    .map((entry) => entry.name)
    .sort();
}

export function buildPublishDir(out, root = ROOT) {
  const target = path.resolve(root, out);
  if (!path.relative(target, root).startsWith('..')) {
    throw new Error(`${target} is the repository or one of its parents`);
  }
  const missing = SITE_ENTRIES.filter((name) => !fs.existsSync(path.join(root, name)));
  if (missing.length) throw new Error(`site entries missing from the checkout: ${missing.join(', ')}`);
  if (fs.existsSync(target)) {
    if (fs.readdirSync(target).length && !fs.existsSync(path.join(target, MARKER))) {
      throw new Error(`${target} is not empty and was not built by this script; refusing to replace it`);
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.mkdirSync(target, { recursive: true });
  const entries = siteEntries(root);
  for (const name of entries) {
    fs.cpSync(path.join(root, name), path.join(target, name), { recursive: true });
  }
  fs.writeFileSync(path.join(target, MARKER), '');
  return entries;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('Usage: node scripts/build-publish-dir.mjs <out-dir>');
    process.exit(1);
  }
  const entries = buildPublishDir(out);
  console.log(`publish dir ${out}: copied ${entries.length} site entries`);
}
