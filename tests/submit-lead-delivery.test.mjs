import assert from 'node:assert/strict';
import test from 'node:test';
import { computeEverythingFailed } from '../netlify/functions/submit-lead.js';

// submit-lead.js's partial-success policy: return 502 (visitor sees an error
// and can retry) only when every delivery channel that was actually attempted
// for this request failed. A channel that was never configured (its result is
// null) must not be treated as "passing" — that let a Twilio-only environment
// (LEAD_WEBHOOK_URL unset) report 200 even when Twilio, its one and only
// channel, actually failed and the lead was lost with nothing to show for it.

test('both channels configured and both succeed -> not everythingFailed', () => {
  assert.equal(computeEverythingFailed({ ok: true }, { ok: true }), false);
});

test('both channels configured, webhook fails but Twilio succeeds -> not everythingFailed', () => {
  assert.equal(computeEverythingFailed({ ok: false }, { ok: true }), false);
});

test('both channels configured and both fail -> everythingFailed', () => {
  assert.equal(computeEverythingFailed({ ok: false }, { ok: false }), true);
});

test('only webhook configured and it fails -> everythingFailed', () => {
  assert.equal(computeEverythingFailed({ ok: false }, null), true);
});

test('only webhook configured and it succeeds -> not everythingFailed', () => {
  assert.equal(computeEverythingFailed({ ok: true }, null), false);
});

test('REGRESSION: only Twilio configured (webhook unset) and Twilio fails -> must be everythingFailed', () => {
  // The original bug: `everythingFailed` was gated on webhookFailed alone, so
  // when LEAD_WEBHOOK_URL is unset webhookResult is null, webhookFailed is
  // always falsy, and the whole expression short-circuits to false no matter
  // what happened to Twilio — a real, attempted, failed delivery reported 200.
  assert.equal(computeEverythingFailed(null, { ok: false }), true);
});

test('only Twilio configured and it succeeds -> not everythingFailed', () => {
  assert.equal(computeEverythingFailed(null, { ok: true }), false);
});

test('neither channel configured or attempted -> not everythingFailed (nothing to report)', () => {
  assert.equal(computeEverythingFailed(null, null), false);
});
