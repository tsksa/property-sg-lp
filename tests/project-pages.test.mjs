import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'projects.json'), 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'project-page-manifest.json'), 'utf8'));
const REFRESHED_SLUGS = [
  'newport-residences',
  'narra-residences',
  'river-modern',
  'tengah-garden-residences',
  'vela-bay',
  'dunearn-house',
];
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const pageFor = (project) => read(new URL(project.canonicalUrl).pathname.slice(1));
const stripTags = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();

test('manifest pages expose the verified dataset contract', () => {
  for (const slug of MANIFEST.slugs) {
    const project = DATA.projects.find((candidate) => candidate.slug === slug);
    assert.ok(project, `${slug}: missing dataset record`);
    const html = pageFor(project);
    for (const expected of [project.name, project.canonicalUrl, project.district, project.region, String(project.unitCount), project.developer]) {
      assert.ok(html.includes(expected), `${slug}: missing ${expected}`);
    }
    assert.match(html, new RegExp(`<link rel="canonical" href="${project.canonicalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
    assert.match(html, /"@type"\s*:\s*"Residence"/);
    assert.match(html, /"@type"\s*:\s*"BreadcrumbList"/);
    assert.match(html, /Verified \d{1,2} [A-Z][a-z]{2} 2026/);
    assert.match(html, /Verification source categories/);
  }
});

test("every Joe's Take is a unique 150–300-word approval-pending draft", () => {
  const takes = new Set();
  for (const slug of MANIFEST.slugs) {
    const project = DATA.projects.find((candidate) => candidate.slug === slug);
    const html = pageFor(project);
    const section = html.match(/<section class="project-take[^>]+data-approval="pending">([\s\S]*?)<\/section>/)?.[1];
    assert.ok(section, `${slug}: approval-pending take missing`);
    const body = section.match(/<div class="project-take-body">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(body, `${slug}: take body missing`);
    const copy = stripTags(body);
    const words = copy.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 150 && words <= 300, `${slug}: take is ${words} words`);
    assert.ok(!takes.has(copy), `${slug}: take is duplicated`);
    takes.add(copy);
  }
});

test('market figures obey freshness fallbacks and each page links three active alternatives', () => {
  for (const slug of MANIFEST.slugs) {
    const project = DATA.projects.find((candidate) => candidate.slug === slug);
    const html = pageFor(project);
    const hasFreshDynamic = [project.priceFrom, project.averagePsf, project.soldPercent].some((field) => field.value != null && field.asOf);
    if (!hasFreshDynamic && project.status === 'selling') assert.match(html, /Selling now—check availability\./);
    if (!hasFreshDynamic && project.status === 'upcoming') assert.match(html, /Ask for latest price/);
    const related = [...html.matchAll(/class="project-related-card"/g)];
    assert.equal(related.length, 3, `${slug}: expected three alternatives`);
    assert.ok(html.indexOf('WhatsApp for price list') < html.indexOf('Use the enquiry form'), `${slug}: WhatsApp must be primary`);
  }
});

test('refreshed pages retain lead forms, tracking and existing media', () => {
  for (const slug of REFRESHED_SLUGS) {
    const project = DATA.projects.find((candidate) => candidate.slug === slug);
    const html = pageFor(project);
    assert.match(html, /id="projectForm"/);
    assert.match(html, /\/assets\/conversion-tracking\.js/);
    assert.match(html, /class="project-tour-wrap/);
    assert.doesNotMatch(html, /before public launch|VIP preview|VVIP preview/i);
  }
});

test('Dunearn House no longer claims D10 or freehold', () => {
  const html = read('new-launches/dunearn-house.html');
  assert.doesNotMatch(html, /\bD10\b/i);
  assert.doesNotMatch(html, /\bfreehold\b/i);
  assert.match(html, /D11/);
  assert.match(html, /99-year leasehold/i);
});

test('manifest project URLs are discoverable in the sitemap', () => {
  const sitemap = read('sitemap.xml');
  for (const slug of MANIFEST.slugs) {
    const project = DATA.projects.find((candidate) => candidate.slug === slug);
    assert.ok(sitemap.includes(`<loc>${project.canonicalUrl}</loc>`), `${slug}: sitemap URL missing`);
  }
});

test('the verified Former Thomson View alias redirects to Thomson Reserve', () => {
  if (!MANIFEST.slugs.includes('thomson-reserve')) return;
  const redirects = read('_redirects');
  assert.match(
    redirects,
    /^\/new-launches\/former-thomson-view\.html \/new-launches\/thomson-reserve\.html 301!$/m,
  );
});

test('every 2026 inventory record has a canonical project page', () => {
  const inventory = DATA.projects.filter((project) => project.inventoryYear === 2026);
  if (MANIFEST.slugs.length < inventory.length) return;
  assert.deepEqual(
    new Set(MANIFEST.slugs),
    new Set(inventory.map((project) => project.slug)),
  );
  for (const project of inventory) {
    assert.ok(fs.existsSync(path.join(ROOT, new URL(project.canonicalUrl).pathname)), `${project.slug}: canonical page missing`);
  }
});
