import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'valuation.html'), 'utf8');

function step(number) {
  const match = html.match(
    new RegExp(`<section class="val-step(?: active)?" data-step="${number}"[\\s\\S]*?<\\/section>`),
  );
  assert.ok(match, `missing valuation step ${number}`);
  return match[0];
}

test('valuation page presents the promised three short sections', () => {
  const numberedSteps = [...html.matchAll(/<section class="val-step(?: active)?" data-step="(\d)"/g)];

  assert.deepEqual(numberedSteps.map((match) => match[1]), ['1', '2', '3']);
  assert.match(html, /role="progressbar"[^>]+aria-valuemax="3"[^>]+aria-valuenow="1"/);
  assert.match(html, /Step <span id="stepNum">1<\/span> of 3/);
});

test('property, contact, and consent fields are split into focused steps', () => {
  const property = step(1);
  const contact = step(2);
  const review = step(3);

  for (const field of ['propType', 'postalCode', 'unitNumber']) {
    assert.match(property, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(property, /name="(?:fullName|mobile|email|consent)"/);

  for (const field of ['fullName', 'mobile', 'email']) {
    assert.match(contact, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(contact, /name="consent"/);

  assert.match(review, /class="val-review"/);
  assert.match(review, /name="consent"[^>]+required/);
  assert.match(review, /type="submit"[^>]+id="submitBtn"/);
});

test('step changes are accessible and funnel tracking stays privacy-safe', () => {
  assert.match(html, /steps\[current\]\.querySelector\('h2'\)\?\.focus/);
  assert.match(html, /progressBar\.setAttribute\('aria-valuetext'/);
  assert.match(html, /jtObserveLeadForm\(form,\{leadType:'valuation'\}\)/);
  assert.match(html, /jtTrackConversion\('lead_form_step_view',\{/);

  const trackingPayload = html.match(/jtTrackConversion\('lead_form_step_view',\{([\s\S]*?)\}\);/)?.[1];
  assert.ok(trackingPayload, 'missing step-view tracking payload');
  assert.doesNotMatch(trackingPayload, /fullName|mobile|email|postal|address/);
});

test('fast valid submissions wait for the spam floor instead of appearing stuck', () => {
  assert.match(
    html,
    /jtWaitForSpamFloor\(form,PAGE_LOADED_AT,3000,\(\)=>form\.requestSubmit\(\)\)/,
  );
});

