import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'projects.json'), 'utf8'));
const CONTENT = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'project-page-content.json'), 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'new-launches', 'project-page-manifest.json'), 'utf8'));
const REFRESHED_SLUGS = [
  'newport-residences',
  'narra-residences',
  'river-modern',
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

test("approved Joe's Takes remain unique and unapproved legacy pages use factual assessments", () => {
  const takes = new Set();
  for (const slug of MANIFEST.slugs) {
    const project = DATA.projects.find((candidate) => candidate.slug === slug);
    const html = pageFor(project);
    if (!CONTENT[slug]) {
      assert.match(html, /data-approval="not-required"/);
      assert.match(html, /Evidence-led assessment/);
      assert.doesNotMatch(html, /Joe’s approved take|Approved by Joe Tay/);
      continue;
    }
    const section = html.match(/<section class="project-take[^>]+data-approval="approved" data-approved-at="2026-08-02">([\s\S]*?)<\/section>/)?.[1];
    assert.ok(section, `${slug}: approved take missing`);
    assert.match(section, /Approved by Joe Tay<\/strong> · 2 Aug 2026/);
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
    if (project.status === 'sold-out') {
      assert.ok(html.indexOf('Compare active alternatives') < html.indexOf('View sold-out archive'), `${slug}: alternatives must be primary`);
    } else {
      assert.ok(html.indexOf('WhatsApp for price list') < html.indexOf('Use the enquiry form'), `${slug}: WhatsApp must be primary`);
    }
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

// The submit-lead function rejects anything missing full_name / mobile_number with a
// 400, and the page then tells the visitor to start over on WhatsApp. That shipped
// once already: the handler sent name/phone, so every enquiry from a project page was
// dropped. Assert the wire contract, not just that a form element exists.
test('project enquiry handler sends the field names submit-lead requires', () => {
  const handler = read('new-launches/project-page-form.js');
  for (const field of ['lead_type', 'full_name', 'mobile_number', 'source_site']) {
    assert.match(handler, new RegExp(`\\b${field}:`), `payload is missing ${field}`);
  }
  // The server ignores these, so sending them means the real field is absent.
  assert.doesNotMatch(handler, /^\s*name:/m, 'payload sends name; submit-lead wants full_name');
  assert.doesNotMatch(handler, /^\s*phone:/m, 'payload sends phone; submit-lead wants mobile_number');
});

// submit-lead.js silently discards anything under its time-on-form floor — it still
// returns HTTP 200 (deliberately, so bots can't tell), which project-page-form.js reads
// as success and shows "Enquiry received." If the shared handler's own client-side gate
// ever allows a submit sooner than the server's floor, a real visitor who fills the form
// in that gap gets told they succeeded while the lead is dropped on the floor. Assert the
// client never opens that window, whatever either threshold is set to.
test("project-page-form.js never lets a submit through before submit-lead.js's time-on-form floor", () => {
  const server = read('netlify/functions/submit-lead.js');
  const serverFloor = server.match(/tOnForm\s*<\s*(\d+)/);
  assert.ok(serverFloor, 'could not find the server time-on-form floor to compare against');

  const client = read('new-launches/project-page-form.js');
  const clientGate = client.match(/Date\.now\(\)\s*-\s*loadedAt\s*<\s*(\d+)\)\s*return;/);
  assert.ok(clientGate, 'could not find the client time-on-form gate');

  assert.ok(
    Number(clientGate[1]) >= Number(serverFloor[1]),
    `client allows submit at ${clientGate[1]}ms but the server floor is ${serverFloor[1]}ms — ` +
      'a real submission in that gap gets shown "Enquiry received" while the lead is silently dropped',
  );
});

// Project pages submit through one of two handlers: the shared project-page-form.js,
// or an inline script on the hand-built pages. Both must satisfy the same contract,
// so resolve whichever a page uses and assert against that.
test('every project page with an enquiry form satisfies the submit-lead contract', () => {
  const shared = read('new-launches/project-page-form.js');
  for (const slug of MANIFEST.slugs) {
    const project = DATA.projects.find((candidate) => candidate.slug === slug);
    const html = pageFor(project);
    if (!/id="projectForm"/.test(html)) continue;
    const handler = html.includes('project-page-form.js') ? shared : html;
    for (const field of ['full_name', 'mobile_number', 'lead_type']) {
      assert.ok(handler.includes(field), `${slug}: enquiry payload is missing ${field}`);
    }
    // Without the helper the page sends no reCAPTCHA token, so every lead is flagged
    // review-required and lands on the free-form WhatsApp path that fails outside a
    // 24-hour session window.
    assert.match(html, /recaptcha-helper\.js/, `${slug}: recaptcha helper not loaded`);
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

test('the Former Pastoral View alias redirects permanently to The Serra Residences', () => {
  const redirects = read('_redirects');
  assert.match(
    redirects,
    /^\/new-launches\/former-pastoral-view\.html \/new-launches\/the-serra-residences\.html 301!$/m,
  );
  const sitemap = read('sitemap.xml');
  assert.doesNotMatch(sitemap, /<loc>https:\/\/joetay\.com\/new-launches\/former-pastoral-view\.html<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/joetay\.com\/new-launches\/the-serra-residences\.html<\/loc>/);
});

test('superseded and excluded legacy URLs are absent from the sitemap', () => {
  const sitemap = read('sitemap.xml');
  for (const review of DATA.legacyReview.filter(({ disposition }) => disposition !== 'retained')) {
    assert.doesNotMatch(
      sitemap,
      new RegExp(`<loc>https://joetay\\.com/new-launches/${review.slug}\\.html</loc>`),
      `${review.slug}: stale sitemap URL`,
    );
  }
});

test('sold-out pages contain no active-sale language and link three active alternatives', () => {
  for (const project of DATA.projects.filter(({ status }) => status === 'sold-out')) {
    const html = pageFor(project);
    assert.match(html, />Sold out</);
    assert.doesNotMatch(html, /Registration open|VVIP|VIP preview|price list|latest (?:available )?unit list|current unit availability/i);
    const links = [...html.matchAll(/class="project-related-card"[^>]*href="([^"]+)"|href="([^"]+)" class="project-related-card"/g)]
      .map((match) => match[1] || match[2]);
    assert.equal(links.length, 3);
    for (const href of links) {
      const related = DATA.projects.find(({ canonicalUrl }) => new URL(canonicalUrl).pathname === href);
      assert.ok(related, `${project.slug}: unknown related link ${href}`);
      assert.notEqual(related.status, 'sold-out', `${project.slug}: sold-out related project`);
    }
  }
});

test('every 2026 inventory record has a canonical project page', () => {
  const inventory = DATA.projects.filter((project) => project.inventoryYear === 2026);
  for (const project of inventory) {
    assert.ok(MANIFEST.slugs.includes(project.slug), `${project.slug}: missing from manifest`);
    assert.ok(fs.existsSync(path.join(ROOT, new URL(project.canonicalUrl).pathname)), `${project.slug}: canonical page missing`);
  }
});

test('every retained legacy record has a canonical project page', () => {
  for (const review of DATA.legacyReview.filter(({ disposition }) => disposition === 'retained')) {
    const project = DATA.projects.find(({ slug }) => slug === review.slug);
    assert.ok(project, `${review.slug}: retained record missing`);
    assert.ok(MANIFEST.slugs.includes(project.slug), `${review.slug}: missing from manifest`);
    assert.ok(fs.existsSync(path.join(ROOT, new URL(project.canonicalUrl).pathname)), `${review.slug}: canonical page missing`);
  }
});
