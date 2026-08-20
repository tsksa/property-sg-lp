import assert from 'node:assert/strict';
import test from 'node:test';

import alertDigest from '../netlify/functions/alert-digest.js';
import subscribeAlert from '../netlify/functions/subscribe-alert.js';
import leadWebhook from '../netlify/functions/lib/lead-webhook.js';

const { deliverAndStamp } = alertDigest;
const { hasDurableCapture } = subscribeAlert;
const { postJson } = leadWebhook;

test('webhook delivery rejects missing configuration and non-2xx responses', async () => {
  await assert.rejects(postJson('', {}), /not configured/);
  await assert.rejects(
    postJson('https://example.test/hook', {}, async () => ({ ok: false, status: 500 })),
    /500/,
  );
});

test('a subscription is successful only when Blobs or the webhook retained it', () => {
  assert.equal(hasDurableCapture(false, false), false);
  assert.equal(hasDurableCapture(true, false), true);
  assert.equal(hasDurableCapture(false, true), true);
});

test('digest delivery is stamped only after the webhook accepts it', async () => {
  const writes = [];
  const store = { set: async (...args) => writes.push(args) };

  await assert.rejects(
    deliverAndStamp({
      webhookUrl: 'https://example.test/hook', payload: {}, store, month: '2026-07',
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /503/,
  );
  assert.deepEqual(writes, []);

  await deliverAndStamp({
    webhookUrl: 'https://example.test/hook', payload: {}, store, month: '2026-07',
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  assert.deepEqual(writes, [['_digested', '2026-07']]);
});
