import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  TOWN_DISTRICT,
  UNMAPPED_DISTRICT_FALLBACK,
  newLaunchesBlock,
  projectsByDistrictFromFile,
} from '../scripts/lib/estate-linking.mjs';

// JOE-289 cycle: an internal-link audit found 10 of 26 active (selling/upcoming)
// new-launch pages had zero inbound links from anywhere in the /hdb-prices/
// cluster — the site's strongest internal-link-equity source — because their
// district (D02, D04, D08, D09, D10, D11, D17, D26) has no matching entry in
// TOWN_DISTRICT. UNMAPPED_DISTRICT_FALLBACK routes those districts to the
// nearest existing town page instead. This guards two ways it can silently
// regress: a fallback target that isn't a real town, and a new project landing
// in a district nobody routes anywhere.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s);

test('every UNMAPPED_DISTRICT_FALLBACK target is a real town in TOWN_DISTRICT', () => {
  for (const [district, slug] of Object.entries(UNMAPPED_DISTRICT_FALLBACK)) {
    assert.ok(slug in TOWN_DISTRICT, `${district} routes to "${slug}", which is not a key in TOWN_DISTRICT`);
  }
});

test('a project in an unmapped district is surfaced on its fallback town page', () => {
  const projectsJson = {
    projects: [
      {
        name: 'Test Tower',
        location: 'Test Street',
        district: 'D09',
        status: 'selling',
        canonicalUrl: 'https://joetay.com/new-launches/test-tower.html',
      },
    ],
  };
  const byDistrict = projectsByDistrictFromFile(projectsJson);
  const block = newLaunchesBlock('central-area', 'Central Area', byDistrict, esc);
  assert.match(block, /Test Tower/);

  // Reproduces the original bug: before the fallback existed, a D09 project
  // showed up on no town page at all.
  const noneMatch = newLaunchesBlock('bedok', 'Bedok', byDistrict, esc);
  assert.doesNotMatch(noneMatch, /Test Tower/);
});

test('no live active project sits in a district with neither a direct town nor a fallback', () => {
  const projectsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'projects.json'), 'utf8'));
  const routedDistricts = new Set([...Object.values(TOWN_DISTRICT), ...Object.keys(UNMAPPED_DISTRICT_FALLBACK)]);
  const orphaned = projectsJson.projects
    .filter((p) => ['selling', 'upcoming'].includes(p.status))
    .filter((p) => !routedDistricts.has(p.district));
  assert.deepEqual(
    orphaned.map((p) => `${p.name} (${p.district})`),
    [],
    'active project(s) in a district with no route to any /hdb-prices/ town page',
  );
});
