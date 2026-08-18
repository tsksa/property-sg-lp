import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATE_WORKFLOW = path.join(ROOT, '.github', 'workflows', 'validate.yml');

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
  const workflow = fs.readFileSync(VALIDATE_WORKFLOW, 'utf8');
  assert.match(
    workflow,
    /\bnpm run check\b|\bnpm test\b/,
    'validate.yml must run `npm run check` (or `npm test`) so every check:*/test:* ' +
      'script in package.json — not just the ones hand-picked into this workflow — ' +
      'runs on every PR',
  );
});
