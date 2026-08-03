import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildCatalogPages, dateKey, filterProjects, sortProjects } from '../scripts/generate-new-launch-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'projects.json'), 'utf8'));
const pages = buildCatalogPages(DATA);

test('all active projects render statically and sold-out projects use the archive', () => {
  assert.equal(pages.active.length, 25);
  assert.equal(pages.soldOutProjects.length, 1);
  assert.equal((pages.index.match(/data-catalog-item/g) || []).length, 25);
  assert.equal((pages.soldOut.match(/data-catalog-item/g) || []).length, 1);
  for (const project of pages.active) {
    assert.match(pages.index, new RegExp(`href="${new URL(project.canonicalUrl).pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(pages.index, new RegExp(`>${project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
  }
  assert.doesNotMatch(pages.index, /href="#register"/);
  assert.doesNotMatch(pages.index, /data-status="sold-out"/);
  assert.match(pages.soldOut, /data-status="sold-out"/);
});

test('search and each requested filter operate on the canonical data', () => {
  const active = pages.active;
  const example = active[0];
  for (const query of [example.name, example.developer, example.location]) {
    assert.ok(filterProjects(active, { query }).some(({ slug }) => slug === example.slug));
  }
  for (const [key, value] of [
    ['status', example.status],
    ['region', example.region],
    ['propertyType', example.propertyType],
    ['tenure', example.tenure],
  ]) {
    const matches = filterProjects(active, { [key]: value });
    assert.ok(matches.length > 0);
    assert.ok(matches.every((project) => project[key] === value));
  }
  const combined = filterProjects(active, {
    query: example.developer,
    status: example.status,
    region: example.region,
    propertyType: example.propertyType,
    tenure: example.tenure,
  });
  assert.ok(combined.some(({ slug }) => slug === example.slug));
  assert.deepEqual(filterProjects(active, { query: 'not-a-real-project-xyz' }), []);
});

test('default, newest and price sorts follow the catalog rules', () => {
  const defaultOrder = sortProjects(pages.active, 'default');
  const firstSelling = defaultOrder.findIndex(({ status }) => status === 'selling');
  assert.equal(firstSelling, defaultOrder.filter(({ status }) => status === 'upcoming').length);
  const upcomingDates = defaultOrder.filter(({ status }) => status === 'upcoming').map(dateKey).filter(Boolean);
  const sellingDates = defaultOrder.filter(({ status }) => status === 'selling').map(dateKey).filter(Boolean);
  assert.deepEqual(upcomingDates, [...upcomingDates].sort());
  assert.deepEqual(sellingDates, [...sellingDates].sort().reverse());

  const newest = sortProjects(pages.active, 'newest');
  const newestDates = newest.map(dateKey).filter(Boolean);
  assert.deepEqual(newestDates, [...newestDates].sort().reverse());
  assert.ok(newest.slice(newestDates.length).every((project) => dateKey(project) == null));

  const byPrice = sortProjects(pages.active, 'price');
  const prices = byPrice.map((project) => project.priceFrom.value);
  const verified = prices.filter((value) => value != null);
  assert.deepEqual(verified, [...verified].sort((a, b) => a - b));
  assert.ok(prices.slice(verified.length).every((value) => value == null));
});

test('metadata, canonical URLs and structured lists are data-derived', () => {
  assert.match(pages.index, /<link rel="canonical" href="https:\/\/joetay\.com\/new-launches\/">/);
  assert.match(pages.index, /"@type": "BreadcrumbList"/);
  assert.match(pages.index, /"@type": "ItemList"/);
  assert.match(pages.index, /"numberOfItems": 25/);
  assert.match(pages.soldOut, /"numberOfItems": 1/);
});
