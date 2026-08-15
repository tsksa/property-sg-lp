#!/usr/bin/env node
// Sets every <lastmod> in sitemap.xml to the date the underlying file actually
// last changed, taken from git history.
//
// Why this matters: lastmod is a crawl-scheduling hint. Before this, every URL
// in the sitemap carried a stale date — the estate pages hard-coded the first
// day of the data month (`${generatedAt}-01`), and the static entries were
// whatever was typed when they were added. On 2026-08-15 the sitemap claimed
// nothing had changed since 2026-07-01 while ~30 pages had been rewritten that
// week. Telling Google a rewritten page is six weeks old suppresses the recrawl
// that would pick the rewrite up.
//
//   node scripts/refresh-sitemap-lastmod.mjs          # rewrite lastmod values
//   node scripts/refresh-sitemap-lastmod.mjs --check  # fail if any understate freshness
//
// Run this AFTER the page generators, since it reads their output.
//
// Note for CI: needs full git history. actions/checkout defaults to a shallow
// clone, where `git log` reports the clone date for every file — set
// `fetch-depth: 0` on any job that runs this.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const APEX = 'https://joetay.com/';
const checkOnly = process.argv.includes('--check');
const TODAY = new Date().toISOString().slice(0, 10);

/** Resolve a published URL to the file that produces it. */
function fileForUrl(url) {
  const rel = url.slice(APEX.length);
  const candidates = rel === '' ? ['index.html'] : [rel, path.join(rel, 'index.html')];
  for (const candidate of candidates) {
    const abs = path.join(ROOT, candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return candidate;
  }
  return null;
}

/** True when the file differs from HEAD — modified, staged, or untracked. */
function hasUncommittedChanges(file) {
  try {
    return (
      execFileSync('git', ['status', '--porcelain', '--', file], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() !== ''
    );
  } catch {
    return false;
  }
}

/**
 * Committer date (YYYY-MM-DD, UTC) of the last commit touching `file`.
 *
 * The date MUST be resolved in UTC to match TODAY above, which comes from
 * toISOString(). The obvious `--format=%cs` renders the date in the offset the
 * commit itself recorded (+0800 for commits made from Singapore), so a commit
 * landing between 16:00 and 24:00 UTC reads as *tomorrow* while TODAY still
 * reads as today. The check then reports every file in that commit as
 * "lastmod <today> but the file changed <tomorrow>" and fails — for a third of
 * every day, on a branch that auto-deploys. Forcing TZ=UTC with an explicit
 * format-local keeps both sides on the same calendar regardless of who
 * committed from where, or which timezone CI happens to run in.
 */
function lastCommitDate(file) {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--date=format-local:%Y-%m-%d', '--format=%cd', '--', file],
      {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, TZ: 'UTC' },
      },
    ).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

const xml = fs.readFileSync(SITEMAP, 'utf8');
const stale = [];
const unresolved = [];
const future = [];

// Rewrite each <url> block independently so ordering and formatting survive.
const updated = xml.replace(/<url>([\s\S]*?)<\/url>/g, (block) => {
  const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
  if (!loc || !loc.startsWith(APEX)) return block;

  const file = fileForUrl(loc);
  if (!file) {
    unresolved.push(loc);
    return block;
  }

  // A file with uncommitted changes is about to be committed as of today, so
  // today is its real change date. Using the last commit instead would stamp
  // every page edited in this same commit with its PREVIOUS date — which is
  // exactly the one-commit lag that made CI reject an otherwise correct run.
  const date = hasUncommittedChanges(file) ? TODAY : lastCommitDate(file);
  if (!date) return block;

  const current = block.match(/<lastmod>([^<]*)<\/lastmod>/)?.[1];
  if (current === date) return block;
  // Only understating freshness is a problem. A lastmod NEWER than the last
  // commit is normal — the file has just been regenerated and not committed yet
  // — and it self-corrects on the next run, so leave it alone.
  //
  // But only up to today: a lastmod dated in the FUTURE cannot be legitimate,
  // and because this branch returns early it would never self-correct. Six such
  // entries (including the homepage) reached main when a timezone-skewed date
  // was written by hand to silence this check. Fall through and correct those.
  if (current && current > date && current <= TODAY) return block;
  if (current && current > TODAY) future.push({ loc, from: current, to: date });
  else stale.push({ loc, from: current || '(none)', to: date });
  return current === undefined
    ? block.replace(/(<loc>[^<]+<\/loc>)/, `$1\n    <lastmod>${date}</lastmod>`)
    : block.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${date}</lastmod>`);
});

for (const loc of unresolved) {
  console.error(`::warning file=sitemap.xml::no file resolves to ${loc}`);
}

if (checkOnly) {
  for (const f of future) {
    console.error(
      `::error file=sitemap.xml::${f.loc} lastmod ${f.from} is in the future (today is ${TODAY} UTC); the file changed ${f.to}`,
    );
  }
  if (stale.length || future.length) {
    for (const s of stale.slice(0, 10)) {
      console.error(`::error file=sitemap.xml::${s.loc} lastmod ${s.from} but the file changed ${s.to}`);
    }
    if (stale.length > 10) console.error(`::error file=sitemap.xml::…and ${stale.length - 10} more`);
    console.error('Run: node scripts/refresh-sitemap-lastmod.mjs');
    process.exit(1);
  }
  console.log('sitemap lastmod values are current');
} else {
  if (stale.length || future.length) fs.writeFileSync(SITEMAP, updated);
  console.log(
    `sitemap lastmod: ${stale.length} updated, ${future.length} future-dated corrected, ${unresolved.length} unresolved`,
  );
}
