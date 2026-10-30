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
  readingBlock,
  townsForDistrict,
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

// JOE-448: launch pages link the town price pages for their district. The
// lookup is the reverse of TOWN_DISTRICT, plus the fallback for districts with
// no town of their own, so every district with an active launch reaches a town.
test('townsForDistrict reverses TOWN_DISTRICT and adds the fallback town', () => {
  assert.deepEqual(townsForDistrict('D19'), ['hougang', 'punggol', 'sengkang', 'serangoon']);
  assert.deepEqual(townsForDistrict('D11'), ['toa-payoh']);
  assert.deepEqual(townsForDistrict('D24'), ['choa-chu-kang']);
  assert.deepEqual(townsForDistrict('D06'), []);
  for (const district of [...new Set([...Object.values(TOWN_DISTRICT), ...Object.keys(UNMAPPED_DISTRICT_FALLBACK)])]) {
    const towns = townsForDistrict(district);
    assert.ok(towns.length, `${district} maps to no town`);
    assert.equal(new Set(towns).size, towns.length, `${district} lists a town twice`);
  }
});

// JOE-448: town pages answer sellers' "<town> HDB resale price" searches but
// linked only articles and tools, never the selling service or valuation.
test('every town page links the HDB selling service and the free valuation first', () => {
  const block = readingBlock('Bedok', esc);
  const items = [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(items[0], 'Selling a flat in Bedok? <a href="/sell-hdb/singapore/">HDB selling service</a>');
  assert.equal(items[1], '<a href="/valuation.html">Free valuation</a>');

  const towns = fs.readdirSync(path.join(ROOT, 'hdb-prices'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  assert.ok(towns.length >= 20);
  for (const town of towns) {
    const html = fs.readFileSync(path.join(ROOT, 'hdb-prices', town, 'index.html'), 'utf8');
    assert.match(html, /<li>Selling a flat in [^<?]+\? <a href="\/sell-hdb\/singapore\/">HDB selling service<\/a><\/li>/, `${town}: no selling-service link`);
    assert.ok(html.includes('<li><a href="/valuation.html">Free valuation</a></li>'), `${town}: no valuation link`);
  }
});

// JOE-469: the calculator link names what it is, the loan comparison guide is
// linked, and two links follow the town's lease profile.
test('the reading list names the HDB loan calculator and varies two links by lease profile', () => {
  const plain = readingBlock('Bedok', esc);
  assert.match(plain, /<li><a href="\/calculator\/">HDB loan calculator<\/a><\/li>/);
  assert.doesNotMatch(plain, /Affordability calculator/);
  assert.match(plain, /<li><a href="\/insights\/hdb-loan-vs-bank-loan-singapore\.html">HDB loan vs bank loan: rates and downpayment<\/a><\/li>/);
  assert.match(plain, /href="\/insights\/selling-hdb-after-mop-singapore\.html"/);
  assert.doesNotMatch(plain, /how-to-sell-hdb-flat-singapore/);

  const third = (block) => [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)][2][1];
  assert.match(third(plain), /hdb-valuation-explained\.html">How agents actually price a flat/);
  assert.match(third(readingBlock('Bedok', esc, { under60: 0.55, over80: 0.1 })), /hdb-valuation-explained\.html">Older lease\?/);
  assert.match(third(readingBlock('Punggol', esc, { under60: 0, over80: 0.7 })), /selling-hdb-after-mop-singapore\.html">Just past MOP\?/);
  for (const profile of [null, { under60: 0.55, over80: 0 }, { under60: 0, over80: 0.7 }]) {
    const items = [...readingBlock('Bedok', esc, profile).matchAll(/<li>/g)];
    assert.equal(items.length, 9);
    for (const href of ['/insights/hdb-valuation-explained.html', '/insights/selling-hdb-after-mop-singapore.html', '/insights/how-long-to-sell-hdb-singapore-2026.html']) {
      assert.ok(readingBlock('Bedok', esc, profile).includes(`href="${href}"`), `${href} missing for ${JSON.stringify(profile)}`);
    }
  }
  for (const target of ['insights/hdb-loan-vs-bank-loan-singapore.html', 'insights/selling-hdb-after-mop-singapore.html', 'insights/hdb-valuation-explained.html']) {
    assert.ok(fs.existsSync(path.join(ROOT, target)), `${target} does not exist`);
  }
});
