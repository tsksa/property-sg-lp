import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// submit-lead.js silently discards anything under its time-on-form floor — it still
// returns HTTP 200 (deliberately, so bots can't tell), which each client reads as
// success. index.html (hero form, valuation popup, exit popup, footer newsletter),
// valuation.html, and the new-launches registration modal all compute and send
// time_on_form_ms but shipped with no client-side gate on it — so a real visitor
// whose autofill fills name+phone in under a second got told they succeeded while
// the lead was silently dropped (same bug class fixed for js/estate-lead.js and
// new-launches/project-page-form.js). Assert none of these clients ever open that
// window, whatever either threshold is set to.

function serverFloor() {
  const server = read('netlify/functions/submit-lead.js');
  const match = server.match(/tOnForm\s*<\s*(\d+)/);
  assert.ok(match, 'could not find the server time-on-form floor to compare against');
  return Number(match[1]);
}

test('index.html never lets a lead form submit through before the server time-on-form floor', () => {
  const client = read('index.html');
  const gate = client.match(/Date\.now\(\)-_pageLoadedAt<(\d+)\)\s*return;/);
  assert.ok(gate, 'could not find a client time-on-form gate in handleFormSubmit (index.html)');
  assert.ok(
    Number(gate[1]) >= serverFloor(),
    `index.html allows submit at ${gate[1]}ms but the server floor is ${serverFloor()}ms — ` +
      'a real submission in that gap gets shown success while the lead is silently dropped',
  );
});

test('valuation.html never lets a submit through before the server time-on-form floor', () => {
  const client = read('valuation.html');
  const gate = client.match(/Date\.now\(\)\s*-\s*PAGE_LOADED_AT\s*<\s*(\d+)\)\s*return;/);
  assert.ok(gate, 'could not find a client time-on-form gate in valuation.html');
  assert.ok(
    Number(gate[1]) >= serverFloor(),
    `valuation.html allows submit at ${gate[1]}ms but the server floor is ${serverFloor()}ms — ` +
      'a real submission in that gap gets shown success while the lead is silently dropped',
  );
});

test('new-launches.js registration modal never lets a submit through before the server time-on-form floor', () => {
  const client = read('new-launches/new-launches.js');
  const gate = client.match(/Date\.now\(\)\s*-\s*modalOpenedAt\s*<\s*(\d+)\)\s*return;/);
  assert.ok(gate, 'could not find a client time-on-form gate in new-launches.js submitModal()');
  assert.ok(
    Number(gate[1]) >= serverFloor(),
    `new-launches.js allows submit at ${gate[1]}ms but the server floor is ${serverFloor()}ms — ` +
      'a real submission in that gap gets shown success while the lead is silently dropped',
  );
});
