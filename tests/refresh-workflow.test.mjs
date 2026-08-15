// Guards `.github/workflows/refresh-estate-pages.yml` against a class of bug
// found in the 2026-08-15 audit: the monthly refresh regenerates hdb-prices/
// and sitemap.xml, but if it commits without running refresh-sitemap-lastmod.mjs
// first, the committed <lastmod> values stay at generate-estate-pages.mjs's
// hard-coded data-month date instead of the real commit date — so validate.yml's
// `check:sitemap-lastmod` gate fails on every refresh PR, every month.
// refresh-sitemap-lastmod.mjs also needs full git history to resolve dates
// correctly (see its own header comment), so the checkout step needs
// fetch-depth: 0 same as validate.yml already carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/refresh-estate-pages.yml');
const yml = fs.readFileSync(WORKFLOW, 'utf8');

test('refresh-estate-pages.yml checks out full git history', () => {
  const checkoutIdx = yml.indexOf('actions/checkout@');
  assert.notEqual(checkoutIdx, -1, 'no actions/checkout step found');
  const nextStepIdx = yml.indexOf('\n      - ', checkoutIdx);
  const checkoutBlock = yml.slice(checkoutIdx, nextStepIdx === -1 ? undefined : nextStepIdx);
  assert.match(
    checkoutBlock,
    /fetch-depth:\s*0/,
    'checkout step must set fetch-depth: 0 — refresh-sitemap-lastmod.mjs reads git history and a shallow clone reports the clone date for every file',
  );
});

test('refresh-estate-pages.yml refreshes sitemap lastmod before committing', () => {
  const refreshCallIdx = yml.search(/node scripts\/refresh-sitemap-lastmod\.mjs\s*$/m);
  assert.notEqual(
    refreshCallIdx,
    -1,
    'workflow never runs refresh-sitemap-lastmod.mjs (rewrite mode) — the committed sitemap keeps generate-estate-pages.mjs\'s hard-coded date instead of the real commit date, so validate.yml will flag every regenerated page as stale',
  );

  const commitIdx = yml.indexOf('git commit');
  assert.notEqual(commitIdx, -1, 'no git commit step found');

  assert.ok(
    refreshCallIdx < commitIdx,
    'refresh-sitemap-lastmod.mjs must run BEFORE git commit — it needs to see the regenerated files as either uncommitted (dated today) or already committed, not run after the commit that would make it a no-op on the next invocation',
  );
});
