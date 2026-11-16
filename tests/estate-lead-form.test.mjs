import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// submit-lead.js silently discards anything under its time-on-form floor — it still
// returns HTTP 200 (deliberately, so bots can't tell), which js/estate-lead.js reads
// as success and shows "Got it." js/estate-lead.js shipped with no client-side gate
// at all, so any submit before the server floor — including a real visitor whose
// autofill fills name+phone in under a second — got told they succeeded while the
// lead was silently dropped on the floor (mirrors the bug fixed for
// new-launches/project-page-form.js). Assert the client never opens that window,
// whatever either threshold is set to.
test("estate-lead.js never lets a submit through before submit-lead.js's time-on-form floor", () => {
  const server = read('netlify/functions/submit-lead.js');
  const serverFloor = server.match(/tOnForm\s*<\s*(\d+)/);
  assert.ok(serverFloor, 'could not find the server time-on-form floor to compare against');

  const client = read('js/estate-lead.js');
  const clientGate = client.match(/Date\.now\(\)\s*-\s*loadedAt\s*<\s*(\d+)\)\s*return;/);
  assert.ok(clientGate, 'could not find a client time-on-form gate in js/estate-lead.js');

  assert.ok(
    Number(clientGate[1]) >= Number(serverFloor[1]),
    `client allows submit at ${clientGate[1]}ms but the server floor is ${serverFloor[1]}ms — ` +
      'a real submission in that gap gets shown "Got it" while the lead is silently dropped',
  );
});

// AUDIT.md S1/U6/C2: every town page carries the seller block directly under
// the price card, and its sold-price lookup is fetched on demand. Loading the
// widget with the page measured about 0.3s of LCP on a throttled phone.
test('every town page has the seller block under the price card, with a lazily loaded lookup', () => {
  const dir = path.join(ROOT, 'hdb-prices');
  const towns = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'index.html')) && fs.statSync(path.join(dir, d)).isDirectory());
  assert.ok(towns.length >= 26, `expected 26 town pages, found ${towns.length}`);
  for (const town of towns) {
    const html = fs.readFileSync(path.join(dir, town, 'index.html'), 'utf8');
    const block = html.match(/<section class="est-sell"[\s\S]*?\n  <\/section>/)?.[0];
    assert.ok(block, `${town}: no seller block`);
    assert.ok(html.indexOf('class="est-sell"') < html.indexOf('<h2>Median price by flat type'), `${town}: seller block is not above the flat-type table`);
    assert.match(block, /<h2 id="est-sell-h">Selling your HDB flat in [^<]+\?<\/h2>/, town);
    assert.match(block, /<form class="jte-form" action="\/neighbour-prices\/" method="get"/, `${town}: lookup form needs its no-JS fallback`);
    assert.match(block, /href="https:\/\/wa\.me\/6581881488\?text=/, `${town}: WhatsApp link`);
    assert.match(block, /href="#estateLeadForm"/, town);
    assert.doesNotMatch(block, /<script/, `${town}: the lookup must not load with the page`);
    assert.match(html, /id="estateLeadForm"/, town);
  }
  const client = fs.readFileSync(path.join(ROOT, 'js/estate-lead.js'), 'utf8');
  assert.match(client, /import\('\/assets\/block-estimate\.js'\)/);
  assert.match(client, /IntersectionObserver/);
  assert.match(client, /addEventListener\('jte:valuation'/);
});

// AUDIT.md G7: the condo district pages carry the same seller block under the
// price card. Condos have no block lookup, so it points at the project table.
test('every condo district page has the seller block under the price card', async () => {
  const { condoSellerBlockHtml, SELLER_BLOCK_CSS } = await import('../scripts/lib/estate-lead-capture.mjs');
  const { DISTRICTS } = await import('../scripts/lib/condo-districts.mjs');
  const dir = path.join(ROOT, 'condo-prices');
  const pages = fs.readdirSync(dir).filter((d) => /^d\d\d$/.test(d));
  assert.ok(pages.length >= 20, `expected the district pages, found ${pages.length}`);
  for (const name of pages) {
    const html = fs.readFileSync(path.join(dir, name, 'index.html'), 'utf8');
    const dn = Number(name.slice(1));
    const hasProjects = html.includes(`<h2 id="district-projects">District ${dn} condo prices by project</h2>`);
    const block = condoSellerBlockHtml({ dn, area: DISTRICTS[name.slice(1)].split(',')[0], hasProjects });
    assert.equal(html.split(block).length - 1, 1, `${name}: seller block missing or not as generated`);
    assert.equal(html.split('class="est-sell"').length - 1, 1, `${name}: one seller block only`);
    assert.ok(html.indexOf('class="vc') < html.indexOf(block), `${name}: seller block should follow the price card`);
    assert.ok(html.indexOf(block) < html.indexOf('<h2>Median price by size'), `${name}: seller block should precede the size table`);
    assert.ok(html.includes(SELLER_BLOCK_CSS), `${name}: seller block styles missing`);
    assert.match(block, /href="https:\/\/wa\.me\/6581881488\?text=[^"]*District%20\d+/, `${name}: WhatsApp message names the district`);
    assert.match(block, /data-cta="whatsapp-condo-seller"/);
    assert.match(block, /href="\/valuation\.html"/);
    // Joe's standing rule: no fees, track record or testimonials without his say.
    assert.doesNotMatch(decodeURIComponent(block), /\d%|commission|\d+\+|sold \d|review/i,`${name}: block must not state fees, records or reviews`);
  }
  assert.doesNotMatch(read('condo-prices/index.html'), /class="est-sell"/, 'the district hub has no seller block');
  const generator = read('scripts/generate-condo-pages.mjs');
  assert.match(generator, /\$\{condoSellerBlockHtml\(\{ dn, area: areaName\.split\(','\)\[0\], hasProjects: projectList\.length > 0 \}\)\}\n  <h2>Median price by size/, 'the monthly refresh must keep emitting the block');
});
