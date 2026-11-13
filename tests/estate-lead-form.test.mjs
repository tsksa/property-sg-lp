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
