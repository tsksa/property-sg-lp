#!/usr/bin/env node
// Replace every Google Fonts <link> group with the self-hosted block from
// scripts/lib/self-hosted-fonts.mjs. Idempotent; `--check` fails if any page
// still references fonts.googleapis.com / fonts.gstatic.com, or carries a
// font block that differs from the library's current output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontLinksHtml, FONT_BLOCK_MARKER } from './lib/self-hosted-fonts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const SKIP = /^(node_modules|\.git|\.claude|tests|scripts|netlify|\.github)(\/|$)/;

function* htmlFiles(dir = ROOT) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs);
    if (SKIP.test(rel)) continue;
    if (entry.isDirectory()) yield* htmlFiles(abs);
    else if (entry.name.endsWith('.html')) yield rel;
  }
}

const GOOGLE_TAG =
  /<link[^>]+href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>|<noscript>\s*<link[^>]+fonts\.googleapis\.com[^>]*>\s*<\/noscript>/g;
const BLOCK = new RegExp(
  `<link rel="preload" as="font"[^>]*>\\n<link rel="preload" as="font"[^>]*>\\n<style ${FONT_BLOCK_MARKER}="(swap|optional)">[^<]*</style>`,
);

export function applySelfHostedFonts(html) {
  const existing = html.match(BLOCK);
  if (existing) {
    return tidy(html.replace(BLOCK, fontLinksHtml({ display: existing[1] })));
  }
  const tags = [...html.matchAll(GOOGLE_TAG)];
  if (!tags.length) return html;
  const display = tags.some((m) => /display=optional/.test(m[0])) ? 'optional' : 'swap';
  const first = tags[0].index;
  let out = html.slice(0, first) + fontLinksHtml({ display }) + html.slice(first);
  // Remove every Google tag after the inserted block, and any blank line each
  // removal leaves behind on its own line.
  out = out.slice(0, first + fontLinksHtml({ display }).length) +
    out.slice(first + fontLinksHtml({ display }).length).replace(GOOGLE_TAG, '');
  return tidy(out);
}

// Removing the old tags leaves their line breaks behind; collapse any run of
// blank lines directly after the font block, and put a trailing tag that shared
// a line with a removed Google tag (the analytics preconnect) on its own line.
function tidy(html) {
  return html
    .replace(/(<\/style>)(<link [^>]+>)/, '$1\n$2')
    .replace(/(data-jt-fonts="(?:swap|optional)">[^<]*<\/style>\n)(?:[ \t]*\n)+/, '$1');
}

let changed = 0;
let checked = 0;
const failures = [];
for (const rel of htmlFiles()) {
  const abs = path.join(ROOT, rel);
  const before = fs.readFileSync(abs, 'utf8');
  if (!/fonts\.googleapis\.com|fonts\.gstatic\.com|data-jt-fonts=/.test(before)) continue;
  checked += 1;
  const after = applySelfHostedFonts(before);
  if (after === before) continue;
  if (CHECK) failures.push(rel);
  else {
    fs.writeFileSync(abs, after);
    changed += 1;
  }
}
if (CHECK) {
  if (failures.length) {
    for (const rel of failures) console.error(`::error::${rel} still loads Google Fonts or has a stale font block — run npm run apply:self-hosted-fonts`);
    process.exit(1);
  }
  console.log(`Self-hosted fonts: ${checked} page(s) current`);
} else {
  console.log(`Self-hosted fonts: ${changed} page(s) updated, ${checked} checked`);
}
