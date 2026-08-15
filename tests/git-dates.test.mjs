import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { lastCommitDateUTC } from '../scripts/lib/git-dates.mjs';

// refresh-sitemap-lastmod.mjs compares a git commit date against
// `new Date().toISOString()` (always UTC). A commit made late at night in a
// positive-offset timezone — e.g. 00:44 SGT (+08:00) — is on the *next*
// calendar day in UTC terms for another ~8 hours. `git log --format=%cs`
// renders using the commit's own recorded offset and ignores the running
// machine's timezone entirely, so a naive read of that date would return
// "the next day" here and disagree with a same-instant UTC computation
// forever (the recorded commit date never changes). Confirmed live on
// 2026-08-15: main's Validate workflow failed permanently on lastmod for
// `sell/`, `rent-out/`, and all 27 hdb-prices pages because of exactly this.

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-dates-test-'));
  const git = (args, env) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  return { dir, git };
}

function commitAt(git, file, isoTimestamp) {
  fs.writeFileSync(file, 'content');
  git(['add', path.basename(file)]);
  git(['commit', '-q', '-m', 'test commit'], {
    GIT_AUTHOR_DATE: isoTimestamp,
    GIT_COMMITTER_DATE: isoTimestamp,
  });
}

test('lastCommitDateUTC matches the UTC day, not the committer offset day', () => {
  const { dir, git } = makeRepo();
  const file = path.join(dir, 'page.html');
  commitAt(git, file, '2026-08-16T00:10:00+08:00');

  const resolved = lastCommitDateUTC('page.html', { cwd: dir });
  assert.equal(resolved, '2026-08-15', `expected the UTC date, got ${resolved}`);

  // Sanity check against the naive approach this replaced: git's default
  // date format uses the committer's own recorded offset and ignores TZ.
  const naive = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'page.html'], {
    cwd: dir,
    encoding: 'utf8',
  }).trim();
  assert.equal(naive, '2026-08-16', 'the naive %cs read should still show the committer-offset day');
  assert.notEqual(resolved, naive, 'the fix must diverge from the naive read for this to matter');
});

test('a commit made mid-afternoon SGT agrees with the naive read (no timezone edge)', () => {
  const { dir, git } = makeRepo();
  const file = path.join(dir, 'page.html');
  commitAt(git, file, '2026-08-15T14:00:00+08:00');

  const resolved = lastCommitDateUTC('page.html', { cwd: dir });
  assert.equal(resolved, '2026-08-15');
});

test('a non-existent path resolves to null rather than throwing', () => {
  const { dir } = makeRepo();
  const resolved = lastCommitDateUTC('missing.html', { cwd: dir });
  assert.equal(resolved, null);
});
