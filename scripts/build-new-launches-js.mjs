#!/usr/bin/env node
// Builds new-launches/new-launches.min.js, the copy of new-launches.js that the
// catalog and every project page load. Edit new-launches.js, then run this.
//
// Why (JOE-472): Lighthouse's unminified-javascript audit failed the project
// pages. A third of new-launches.js is comments and indentation, about 2.3 KB of
// every page load once compressed, over the audit's 2 KB limit.
//
// The transform is deliberately small and safe rather than a real minifier (the
// site has no build dependencies): it drops whole-line // and /* */ comments,
// blank lines and leading indentation, and keeps every line break so automatic
// semicolon insertion behaves exactly as in the source. It refuses input it
// cannot handle safely (template literals, line continuations, code after a
// block comment) instead of guessing.
//
// Run:   node scripts/build-new-launches-js.mjs
// Check: node scripts/build-new-launches-js.mjs --check   (fails if the copy is stale)

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'new-launches/new-launches.js';
export const OUTPUT = 'new-launches/new-launches.min.js';
const BANNER = `// Built from ${SOURCE} by scripts/build-new-launches-js.mjs. Do not edit.`;

export function stripScript(source) {
  const out = [];
  let inBlockComment = false;
  source.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    const where = `line ${index + 1}`;
    if (inBlockComment) {
      if (!line.includes('*/')) return;
      inBlockComment = false;
      if (line.slice(line.indexOf('*/') + 2).trim()) throw new Error(`${where}: code after a block comment`);
      return;
    }
    if (!line || line.startsWith('//')) return;
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlockComment = true;
      else if (line.slice(line.indexOf('*/') + 2).trim()) throw new Error(`${where}: code after a block comment`);
      return;
    }
    if (line.includes('`')) throw new Error(`${where}: template literals are not supported`);
    if (line.endsWith('\\')) throw new Error(`${where}: line continuations are not supported`);
    out.push(line);
  });
  if (inBlockComment) throw new Error('unterminated block comment');
  return `${BANNER}\n${out.join('\n')}\n`;
}

export function buildScript() {
  const built = stripScript(fs.readFileSync(path.join(ROOT, SOURCE), 'utf8'));
  new vm.Script(built, { filename: OUTPUT }); // throws on a syntax error
  return built;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const built = buildScript();
  const target = path.join(ROOT, OUTPUT);
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== built) {
      console.error(`::error::${OUTPUT} is stale — run node scripts/build-new-launches-js.mjs`);
      process.exit(1);
    }
    console.log(`${OUTPUT} is up to date`);
  } else {
    fs.writeFileSync(target, built);
    console.log(`Wrote ${OUTPUT} (${built.length} bytes from ${fs.statSync(path.join(ROOT, SOURCE)).size})`);
  }
}
