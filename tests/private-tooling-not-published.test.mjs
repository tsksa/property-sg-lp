import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
