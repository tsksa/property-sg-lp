import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EXPECTED_2026_PROJECTS,
  validateNewLaunchData,
} from '../scripts/check-new-launches.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'new-launches', 'projects.json'), 'utf8'),
);
const NOW = new Date('2026-07-30T12:00:00Z');
const clone = () => structuredClone(DATA);
const validate = (data) => validateNewLaunchData(data, { now: NOW });

test('the verified new-launch dataset passes its contract', () => {
  assert.deepEqual(validate(clone()), []);
});

test('all 23 approved 2026 projects appear exactly once', () => {
  const names = DATA.projects
    .filter((project) => project.inventoryYear === 2026)
    .map((project) => project.name)
    .sort();

  assert.deepEqual(names, [...EXPECTED_2026_PROJECTS].sort());
});

test('missing required fields identify the project and field', () => {
  const data = clone();
  delete data.projects[0].developer;

  assert.ok(
    validate(data).some(
      (error) =>
        error.includes('coastal-cabana.developer') &&
        error.includes('required'),
    ),
  );
});

test('duplicate slugs are rejected', () => {
  const data = clone();
  data.projects[1].slug = data.projects[0].slug;
  data.projects[1].canonicalUrl = data.projects[0].canonicalUrl;

  assert.ok(
    validate(data).some((error) => error.includes('slug is duplicated')),
  );
});

test('invalid dates and statuses are rejected', () => {
  const data = clone();
  data.projects[0].verifiedAt = '2026-02-30';
  data.projects[1].status = 'registration-open';

  const errors = validate(data);
  assert.ok(errors.some((error) => error.includes('verifiedAt')));
  assert.ok(errors.some((error) => error.includes('status is invalid')));
});

test('placeholder content is rejected', () => {
  const data = clone();
  data.projects[0].developer = 'From $—';

  assert.ok(
    validate(data).some((error) => error.includes('placeholder content')),
  );
});

test('dynamic values older than seven days are rejected', () => {
  const data = clone();
  data.projects[0].averagePsf.asOf = '2026-07-20';

  assert.ok(
    validate(data).some(
      (error) =>
        error.includes('coastal-cabana.averagePsf') &&
        error.includes('10 days old'),
    ),
  );
});

test('dynamic nulls cannot retain an as-of date', () => {
  const data = clone();
  data.projects[0].priceFrom.asOf = '2026-07-30';

  assert.ok(
    validate(data).some(
      (error) =>
        error.includes('coastal-cabana.priceFrom.asOf') &&
        error.includes('must be null'),
    ),
  );
});

test('legacy projects require verified remaining-inventory evidence', () => {
  const data = clone();
  const faber = data.projects.find(
    (project) => project.slug === 'faber-residence',
  );
  faber.legacyInventoryEvidence = null;

  assert.ok(
    validate(data).some(
      (error) =>
        error.includes('faber-residence.legacyInventoryEvidence') &&
        error.includes('verify remaining inventory'),
    ),
  );
});

test('every provenance reference must resolve to a source record', () => {
  const data = clone();
  data.projects[0].provenance.facts = ['missing-source'];

  assert.ok(
    validate(data).some(
      (error) =>
        error.includes('provenance.facts') &&
        error.includes('missing-source'),
    ),
  );
});
