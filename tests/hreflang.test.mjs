import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://joetay.com';
const SKIP_DIRS = new Set(['.git', '.github', '.netlify', 'node_modules', 'netlify', 'ops', 'scripts', 'tests', 'tools']);

function htmlFiles(dir = ROOT) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) || entry.name.startsWith('.') ? [] : htmlFiles(path.join(dir, entry.name));
    return entry.name.endsWith('.html') ? [path.relative(ROOT, path.join(dir, entry.name))] : [];
  });
}

function fileForUrl(url) {
  assert.ok(url.startsWith(`${ORIGIN}/`), `${url} is not on ${ORIGIN}`);
  const pathname = url.slice(ORIGIN.length + 1);
  return pathname === '' || pathname.endsWith('/') ? `${pathname}index.html` : pathname;
}

function languageLinks(html) {
  return [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(([, lang, href]) => ({ lang, href }));
}

const pages = new Map();
for (const file of htmlFiles()) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const links = languageLinks(html);
  if (!links.length) continue;
  pages.set(file, { canonical: html.match(/<link rel="canonical" href="([^"]+)">/)?.[1], links });
}

// The zh pages are hand-written, and three of them shipped with their zh-Hans
// line twice while /zh/new-launches/ named the EC article as its own Chinese
// version (JOE-449). Google drops a whole hreflang cluster when the pages in it
// disagree, so each language version must list the same set as its twins.
test('hreflang clusters exist on both the English and the Chinese pages', () => {
  const zh = [...pages.keys()].filter((file) => file.startsWith('zh/'));
  assert.ok(zh.length >= 5, `expected the five zh pages, found ${zh.length}`);
});

test('every page lists each hreflang once and includes itself', () => {
  for (const [file, { canonical, links }] of pages) {
    const langs = links.map(({ lang }) => lang);
    assert.equal(new Set(langs).size, langs.length, `${file}: duplicate hreflang in ${langs.join(', ')}`);
    assert.ok(canonical, `${file}: hreflang without a canonical`);
    assert.ok(links.some(({ href }) => href === canonical), `${file}: no hreflang points at its canonical ${canonical}`);
  }
});

test('every hreflang alternate exists and returns the same cluster', () => {
  for (const [file, { links }] of pages) {
    const cluster = JSON.stringify([...links].sort((a, b) => a.lang.localeCompare(b.lang)));
    for (const { lang, href } of links) {
      const twin = fileForUrl(href);
      assert.ok(pages.has(twin), `${file}: ${lang} alternate ${href} has no page with hreflang`);
      assert.equal(pages.get(twin).canonical, href, `${file}: ${lang} alternate ${href} is not that page's canonical`);
      const twinCluster = JSON.stringify([...pages.get(twin).links].sort((a, b) => a.lang.localeCompare(b.lang)));
      assert.equal(twinCluster, cluster, `${file} and ${twin} disagree on their hreflang cluster`);
    }
  }
});
