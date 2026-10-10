import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SITE_ENTRIES, SITE_ROOT_IMAGE, buildPublishDir } from '../scripts/build-publish-dir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The bug this pins: on 2026-09-16 a `git add -A` swept tools/google-ads-report/
// into a site PR. Netlify publishes the repository root (publish = "."), so the
// Google Ads search-term audit, API design document and scripts became public
// URLs on joetay.com within a minute of merging. tools/ holds another agent's
// local tooling and must never be tracked. (The same commit also swept in two
// untracked ops/newsletters drafts; those were untracked individually, since
// that directory has one file its owner committed on purpose in #354.)
const PRIVATE_DIRS = ['tools'];

test('private tooling directories are not tracked, so they cannot be published', () => {
  const tracked = execFileSync('git', ['ls-files', '--', ...PRIVATE_DIRS], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(tracked, '', `these files would be served publicly on joetay.com:\n${tracked}`);
});

// The wider bug (JOE-450): publishing the root also served AGENTS.md, CLAUDE.md,
// package.json, linear-triage.csv, every build script, every test and the
// Netlify Functions source (HTTP 200 on 9 Oct 2026). Netlify now deploys _site,
// an allowlisted copy built by scripts/build-publish-dir.mjs. Everything at the
// top level must be classified, so a new page folder is not silently left out
// of the deploy and a new internal file is not added to the allowlist unseen.
const INTERNAL_ENTRIES = [
  'AGENTS.md', 'ARCHITECTURE.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'LICENSE', 'README.md', 'SECURITY.md',
  'design-qa.md', 'linear-triage.csv', 'linear-triage.md', 'netlify.toml', 'package.json',
  'netlify', 'ops', 'scripts', 'tests', ...PRIVATE_DIRS,
];
const INTERNAL = new Set(INTERNAL_ENTRIES.map((name) => name.toLowerCase()));

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
const topLevel = new Map();
for (const file of trackedFiles) {
  const [entry, ...rest] = file.split('/');
  topLevel.set(entry, { dir: rest.length > 0 });
}
const isSiteEntry = (name) => SITE_ENTRIES.includes(name) || (topLevel.get(name)?.dir === false && SITE_ROOT_IMAGE.test(name));
const siteFiles = trackedFiles.filter((file) => isSiteEntry(file.split('/')[0]));

test('Netlify deploys the allowlisted _site copy, not the repository root', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  const section = (name) => toml.split(/\n(?=\[)/).find((block) => block.startsWith(`[${name}]`)) ?? '';
  const build = section('build');
  assert.match(build, /^\s*command = "node scripts\/prepare-sitemap\.mjs && node scripts\/build-publish-dir\.mjs _site"$/m);
  assert.match(build, /^\s*publish = "_site"$/m);
  assert.match(build, /^\s*functions = "netlify\/functions"$/m);
  assert.match(section('dev'), /^\s*publish = "\."$/m, '`netlify dev` should keep serving the working tree');
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^_site\/$/m);
});

test('every tracked top-level entry is classified as site or internal', () => {
  const unclassified = [...topLevel.keys()].filter((name) =>
    name !== '.well-known' && !name.startsWith('.') && !isSiteEntry(name) && !INTERNAL_ENTRIES.includes(name));
  assert.deepEqual(unclassified, [],
    'add public pages/assets to SITE_ENTRIES in scripts/build-publish-dir.mjs (or they will not be deployed), ' +
    'and internal files to INTERNAL_ENTRIES here');
  assert.deepEqual(SITE_ENTRIES.filter((name) => !topLevel.has(name)), [], 'SITE_ENTRIES names an entry that is not tracked');
  assert.deepEqual(SITE_ENTRIES.filter((name) => INTERNAL.has(name.toLowerCase())), []);
});

test('the publish directory holds every site file and no internal file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-dir-'));
  const out = path.join(tmp, '_site');
  try {
    buildPublishDir(out, ROOT);
    const published = new Set(execFileSync('find', ['.', '-type', 'f'], { cwd: out, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((file) => file.replace(/^\.\//, '')));

    assert.deepEqual(siteFiles.filter((file) => !published.has(file)), [], 'site files missing from the deploy');
    const leaked = [...published].filter((file) => {
      const top = file.split('/')[0];
      return INTERNAL.has(top.toLowerCase()) || (top.startsWith('.') && top !== '.well-known' && top !== '.publish-dir');
    });
    assert.deepEqual(leaked, [], 'internal files would be deployed');
    for (const file of ['AGENTS.md', 'CLAUDE.md', 'package.json', 'linear-triage.csv',
      'scripts/generate-estate-pages.mjs', 'netlify/functions/submit-lead.js']) {
      assert.ok(!published.has(file), `${file} would be public`);
    }
    for (const file of ['index.html', '404.html', '_redirects', '.well-known/security.txt', 'sitemap.xml']) {
      assert.ok(published.has(file), `${file} must be deployed`);
    }

    // A rerun replaces a directory this script built…
    buildPublishDir(out, ROOT);
    assert.ok(fs.existsSync(path.join(out, 'index.html')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the build never replaces a directory it did not create', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-dir-'));
  try {
    fs.writeFileSync(path.join(tmp, 'keep.txt'), 'not ours');
    assert.throws(() => buildPublishDir(tmp, ROOT), /refusing to replace it/);
    assert.equal(fs.readFileSync(path.join(tmp, 'keep.txt'), 'utf8'), 'not ours');
    assert.throws(() => buildPublishDir(ROOT, ROOT), /repository or one of its parents/);
    assert.throws(() => buildPublishDir(path.dirname(ROOT), ROOT), /repository or one of its parents/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('no site file links to or loads an internal path', () => {
  const TEXT = /\.(?:html|js|mjs|css|json|webmanifest|xml|txt)$/;
  const REFS = [
    /\b(?:src|href|action|poster|data-src)\s*=\s*["']([^"']+)["']/gi,
    /\bsrcset\s*=\s*["']([^"'\s,]+)/gi,
    /\b(?:import|from)\s*\(?\s*["']([^"']+)["']/g,
    /\bfetch\(\s*["'`]([^"'`$]+)["'`]/g,
    /\burl\(\s*["']?([^"')]+)["']?\s*\)/g,
    /(https:\/\/joetay\.com\/[^\s"'<>)\]]*)/g,
  ];
  const offenders = [];
  for (const file of siteFiles.filter((f) => TEXT.test(f))) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const pattern of REFS) {
      for (const [, ref] of text.matchAll(pattern)) {
        let url;
        try { url = new URL(ref.replace(/&amp;/g, '&'), `https://joetay.com/${file}`); } catch { continue; }
        const top = decodeURIComponent(url.pathname).split('/')[1] ?? '';
        if (url.origin === 'https://joetay.com' && INTERNAL.has(top.toLowerCase())) offenders.push(`${file}: ${ref}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
