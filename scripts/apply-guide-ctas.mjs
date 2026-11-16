#!/usr/bin/env node
// Keeps the end-of-guide contact prompts (scripts/lib/guide-cta.mjs) in the
// hand-written guides in step with that list (AUDIT.md C3). Generated guides
// get the same block from their generators, so they pass through unchanged.
//
//   node scripts/apply-guide-ctas.mjs          rewrite the blocks
//   node scripts/apply-guide-ctas.mjs --check  fail if any guide is out of step
//
// A guide without the markers yet gets the block in place of its generic
// "Thinking about selling?" box, or, if it has none, just before the end of
// the article body.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUIDE_CTAS, CTA_START, CTA_END, guideEndCtaHtml } from './lib/guide-cta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERIC = /<div class="article-cta">\n  <h3>Thinking about selling\?<\/h3>\n[\s\S]*?\n<\/div>\n/g;
const BODY_END = '</section></article></main>';

export function applyGuideCta(html, slug) {
  const block = guideEndCtaHtml(slug);
  const start = html.indexOf(CTA_START);
  if (start !== -1) {
    const end = html.indexOf(CTA_END, start);
    if (end === -1) throw new Error(`${slug}: guide-cta start marker without an end marker`);
    return html.slice(0, start) + block + html.slice(end + CTA_END.length);
  }
  const generic = html.match(GENERIC) ?? [];
  if (generic.length > 1) throw new Error(`${slug}: more than one generic end box`);
  if (generic.length === 1) return html.replace(GENERIC, () => `${block}\n`);
  if (html.split(BODY_END).length !== 2) throw new Error(`${slug}: expected one "${BODY_END}"`);
  return html.replace(BODY_END, () => `${block}\n${BODY_END}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const stale = [];
  let written = 0;
  for (const slug of Object.keys(GUIDE_CTAS)) {
    const file = path.join(ROOT, 'insights', `${slug}.html`);
    const html = fs.readFileSync(file, 'utf8');
    const next = applyGuideCta(html, slug);
    if (next === html) continue;
    if (check) stale.push(`insights/${slug}.html`);
    else { fs.writeFileSync(file, next); written++; }
  }
  if (check && stale.length) {
    for (const f of stale) console.error(`::error file=${f}::end-of-guide prompt is out of step; run npm run apply:guide-ctas`);
    process.exit(1);
  }
  console.log(check ? `Guide prompts: ${Object.keys(GUIDE_CTAS).length} guides in step` : `Guide prompts: ${written} guide(s) updated`);
}
