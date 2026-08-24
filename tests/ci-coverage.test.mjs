import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATE_WORKFLOW = path.join(ROOT, '.github', 'workflows', 'validate.yml');
const workflow = fs.readFileSync(VALIDATE_WORKFLOW, 'utf8');
const NODE_WORKFLOWS = [
  'data-freshness.yml',
  'refresh-estate-pages.yml',
  'search-growth-report.yml',
  'validate.yml',
];

// The bug this pins: validate.yml hand-picked a handful of check/test scripts
// (check-consistency, check-new-launches, sitemap-lastmod, JSON-LD/feed lint)
// instead of running `npm run check`. That left 11 of the 13 check:*/test:*
// scripts in package.json — including tests/calculator-rules.test.mjs and
// tests/stamp-duty-rules.test.mjs, which pin the exact money-figure regression
// that previously overstated a buyer's max budget by ~$64k — never executed in
// CI. A PR could reintroduce that bug, break the shared header/footer
// injection, or corrupt a generated page and still show a green Validate check.
//
// This asserts the workflow actually invokes the full suite rather than trying
// to enumerate every individual script it must cover — cheap to keep true, and
// it fails today (pre-fix) with npm run check absent from validate.yml.
test('CI runs the full npm run check suite, not a hand-picked subset', () => {
  assert.match(
    workflow,
    /\bnpm run check\b|\bnpm test\b/,
    'validate.yml must run `npm run check` (or `npm test`) so every check:*/test:* ' +
      'script in package.json — not just the ones hand-picked into this workflow — ' +
      'runs on every PR',
  );
});

test('CI validates every pull request and push to main without fragile path filters', () => {
  const permissionsIndex = workflow.indexOf('\npermissions:');
  assert.notEqual(permissionsIndex, -1, 'validate.yml has no permissions block after its triggers');
  const triggers = workflow.slice(0, permissionsIndex);

  assert.match(
    triggers,
    /\n  pull_request:\n    branches: \[main\](?:\n|$)/,
    'Validate must run for pull requests targeting main',
  );
  assert.match(
    triggers,
    /\n  push:\n    branches: \[main\](?:\n|$)/,
    'Validate must run for pushes to main',
  );
  assert.doesNotMatch(
    triggers,
    /^\s+(?:paths|paths-ignore):/m,
    'Validate must not use path filters: they previously let script-only merges bypass the full suite',
  );
});

test('Netlify builds and every Node workflow use the Node 22 runtime required by dependencies', () => {
  const nvmVersion = fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim();
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  assert.equal(nvmVersion, '22', '.nvmrc must pin Netlify builds and Functions to Node 22');
  assert.equal(
    packageJson.engines?.node,
    '>=22.12.0',
    'package.json must reject Node versions below the @netlify/blobs v11 minimum',
  );

  for (const filename of NODE_WORKFLOWS) {
    const contents = fs.readFileSync(path.join(ROOT, '.github', 'workflows', filename), 'utf8');
    assert.match(contents, /node-version: ["']22["']/, `${filename} must run on Node 22`);
    assert.doesNotMatch(contents, /node-version: ["']20["']/, `${filename} still declares Node 20`);
  }
});
