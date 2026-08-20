#!/usr/bin/env node
// Internal-link guard for a build-less, 75-file site.
//
// No template layer means every internal href is typed out by hand on every
// page. Nothing previously verified the target of any of them actually
// exists — a typo, a renamed file, or a copy-pasted link to a page that was
// since deleted (see PR #313, dead new-launch pages left behind by forced
// redirects) is invisible until a crawler or a visitor hits the 404. That is
// the opposite of the site's stated priority: crawlable surface area and
// internal link equity, not on-page polish.
//
// Two checks:
//   1. Broken links — the href's target file does not exist on disk. Fails.
//   2. Redirect hops — the href points at a path forced through a 301! in
//      _redirects instead of the canonical target. Not broken (the visitor
//      still lands on the right page), but every hop leaks link equity and
//      costs a crawl-budget round trip, so it's a warning, not a failure.
//
// Run: node scripts/check-internal-links.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDED_DIRS = new Set(['node_modules', 'scripts', 'ops', 'tests']);
const HREF_RE = /\bhref\s*=\s*(["'])(.*?)\1/gi;
const SITE_ORIGIN = 'https://joetay.com';

export function findHtmlFiles(root = ROOT) {
  const pages = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue;
        walk(abs);
      } else if (entry.name.endsWith('.html')) {
        pages.push(path.relative(root, abs));
      }
    }
  })(root);
  return pages.sort();
}

// Resolve root-relative, document-relative and same-origin absolute links from
// the source page. External origins and non-HTTP schemes are outside this
// local-file guard. Hashes and queries do not affect the target file.
function internalPathname(href, sourceFile) {
  let resolved;
  try {
    resolved = new URL(href, new URL(sourceFile.replaceAll(path.sep, '/'), `${SITE_ORIGIN}/`));
  } catch {
    return null;
  }
  if (resolved.origin !== SITE_ORIGIN) return null;
  try {
    return decodeURIComponent(resolved.pathname);
  } catch {
    return resolved.pathname;
  }
}

function targetExists(root, pathname) {
  const relative = pathname.replace(/^\/+/, '');
  if (relative === '') return fs.existsSync(path.join(root, 'index.html'));

  const full = path.join(root, relative);
  if (pathname.endsWith('/')) return fs.existsSync(path.join(full, 'index.html'));
  if (fs.existsSync(full)) {
    return fs.statSync(full).isFile() || fs.existsSync(path.join(full, 'index.html'));
  }
  // Netlify Pretty URLs serves /page from page.html.
  return fs.existsSync(`${full}.html`);
}

function forcedRedirectFroms(root) {
  const file = path.join(root, '_redirects');
  return new Set(
    (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => line.trim().split(/\s+/))
      .filter(([, , code]) => code === '301!')
      .map(([from]) => from),
  );
}

export function findBrokenLinks(root = ROOT, pages = findHtmlFiles(root)) {
  const broken = [];
  for (const rel of pages) {
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const match of html.matchAll(HREF_RE)) {
      const href = match[2].trim();
      const pathname = internalPathname(href, rel);
      if (pathname !== null && !targetExists(root, pathname)) broken.push({ file: rel, href });
    }
  }
  return broken;
}

export function findRedirectHops(root = ROOT, pages = findHtmlFiles(root)) {
  const froms = forcedRedirectFroms(root);
  const hops = [];
  for (const rel of pages) {
    // A source file that Netlify redirects before serving is not a crawlable
    // document. Its own canonical and fragment links never reach a visitor.
    if (froms.has(internalPathname('', rel))) continue;
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const match of html.matchAll(HREF_RE)) {
      const href = match[2].trim();
      const pathname = internalPathname(href, rel);
      if (pathname !== null && froms.has(pathname)) hops.push({ file: rel, href });
    }
  }
  return hops;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pages = findHtmlFiles();
  const broken = findBrokenLinks(ROOT, pages);
  const hops = findRedirectHops(ROOT, pages);

  for (const { file, href } of hops) {
    console.error(`::warning file=${file}::internal link "${href}" points through a forced redirect — link the canonical target directly`);
  }

  if (broken.length) {
    for (const { file, href } of broken) {
      console.error(`::error file=${file}::broken internal link — "${href}" does not resolve to a page or file on disk`);
    }
    console.error(
      `\n${broken.length} broken internal link(s) across ${new Set(broken.map((b) => b.file)).size} file(s).`,
    );
    process.exit(1);
  }

  console.log(
    `Internal links: 0 broken across ${pages.length} pages checked` +
      (hops.length ? ` (${hops.length} redirect-hop warning(s))` : ''),
  );
}
