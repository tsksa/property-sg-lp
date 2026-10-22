import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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

// Run the real handler with only its integration boundaries replaced. The VM
// has no real environment or fetch; Blobs hydration, reads, writes and webhook
// forwarding are all recorded mocks, so these tests cannot create live leads.
function mockSubscriptionHandler({ blobsAvailable = true, storageSucceeds = true, webhookSucceeds = true } = {}) {
  const calls = [];
  const store = {
    get: async (key) => { calls.push(['get', key]); return null; },
    set: async (...args) => { calls.push(['set', ...args]); },
    setJSON: async (...args) => {
      calls.push(['setJSON', ...args]);
      if (!storageSucceeds) throw new Error('mock storage failed');
    },
  };
  const context = {
    exports: {},
    process: { env: { LEAD_WEBHOOK_URL: 'https://webhook.example.test/price-alert' } },
    console: { error() {}, warn() {} },
    require(specifier) {
      if (specifier === 'crypto') return crypto;
      assert.equal(specifier, './lib/lead-webhook');
      return {
        postJson: async (...args) => {
          calls.push(['postJson', ...args]);
          if (!webhookSucceeds) throw new Error('mock webhook failed');
        },
      };
    },
    async mockBlobs() {
      calls.push(['importBlobs']);
      if (!blobsAvailable) throw new Error('mock Blobs unavailable');
      return {
        connectLambda: (event) => calls.push(['connectLambda', event]),
        getStore: (name) => { calls.push(['getStore', name]); return store; },
      };
    },
  };
  const source = fs.readFileSync(new URL('../netlify/functions/subscribe-alert.js', import.meta.url), 'utf8');
  const importExpression = "await import('@netlify/blobs')";
  assert.equal(source.split(importExpression).length, 2, 'mock exactly one Blobs import');
  vm.runInNewContext(source.replace(importExpression, 'await mockBlobs()'), context);
  return { handler: context.exports.handler, calls };
}

function subscriptionEvent(headers = { origin: 'https://joetay.com', 'sec-fetch-site': 'same-origin' }) {
  return {
    httpMethod: 'POST', headers,
    body: JSON.stringify({
      name: 'Test Subscriber', contact: 'subscriber@example.test', consent: true,
      postal_code: '123456', block: '123', street_name: 'TEST STREET', town: 'TEST TOWN',
    }),
  };
}

for (const origin of [
  'https://joetay.com',
  'https://www.joetay.com',
  'https://propertysg78.netlify.app',
  'https://deploy-preview-999--propertysg78.netlify.app',
  'https://feature-alerts--propertysg78.netlify.app',
]) {
  test(`price-alert accepts the site's browser origin: ${origin}`, async () => {
    const { handler, calls } = mockSubscriptionHandler();
    const response = await handler(subscriptionEvent({ origin, 'sec-fetch-site': 'same-origin' }));
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).ok, true);
    assert.equal(response.headers['Access-Control-Allow-Origin'], origin);
    assert.equal(calls.filter(([name]) => name === 'setJSON').length, 1);
    assert.equal(calls.filter(([name]) => name === 'postJson').length, 1);
  });
}

for (const [label, headers] of [
  ['untrusted origin with a simple text/plain body', { origin: 'https://evil.example', 'content-type': 'text/plain' }],
  ['opaque null origin', { origin: 'null' }],
  ['misleading production suffix', { origin: 'https://joetay.com.evil.example' }],
  ['misleading Netlify suffix', { origin: 'https://propertysg78.netlify.app.evil.example' }],
  ['another Netlify site', { origin: 'https://evil.netlify.app' }],
  ['insecure production origin', { origin: 'http://joetay.com' }],
  ['URL credentials', { origin: 'https://joetay.com@evil.example' }],
  ['URL path', { origin: 'https://joetay.com/path' }],
  ['nonstandard port', { origin: 'https://joetay.com:444' }],
  ['multiple origin values', { origin: 'https://joetay.com, https://evil.example' }],
  ['cross-site metadata despite an allowed origin', { origin: 'https://joetay.com', 'sec-fetch-site': 'cross-site' }],
  ['cross-site metadata with capitalized header names', { Origin: 'https://joetay.com', 'Sec-Fetch-Site': 'cross-site' }],
  ['cross-site metadata without Origin', { 'sec-fetch-site': 'cross-site' }],
  ['missing Origin and metadata', {}],
  ['empty Origin', { origin: '' }],
  ['same-origin metadata without Origin', { 'sec-fetch-site': 'same-origin' }],
  ['same-site metadata without Origin', { 'sec-fetch-site': 'same-site' }],
  ['unexpected fetch metadata', { origin: 'https://joetay.com', 'sec-fetch-site': 'none' }],
]) {
  test(`price-alert rejects ${label} before any side effects`, async () => {
    const { handler, calls } = mockSubscriptionHandler();
    const response = await handler(subscriptionEvent(headers));
    assert.equal(response.statusCode, 403);
    assert.equal(JSON.parse(response.body).ok, false);
    assert.deepEqual(calls, [], 'no Blobs import/hydration, reads, writes or webhook forwarding');
  });
}

test('origin rejection precedes body parsing, honeypot and all storage/forwarding', async () => {
  const { handler, calls } = mockSubscriptionHandler();
  for (const body of ['invalid JSON', JSON.stringify({ company_website: 'bot.example' })]) {
    const response = await handler({ ...subscriptionEvent({ origin: 'https://evil.example' }), body });
    assert.equal(response.statusCode, 403);
  }
  const missingHeaders = await handler({ ...subscriptionEvent(), headers: undefined });
  assert.equal(missingHeaders.statusCode, 403);
  assert.deepEqual(calls, []);
});

test('trusted Origin works without Fetch Metadata and with same-site metadata', async () => {
  for (const headers of [
    { origin: 'https://joetay.com' },
    { Origin: 'https://www.joetay.com', 'Sec-Fetch-Site': 'same-site' },
  ]) {
    const { handler, calls } = mockSubscriptionHandler();
    const response = await handler(subscriptionEvent(headers));
    assert.equal(response.statusCode, 200);
    assert.equal(calls.filter(([name]) => name === 'setJSON').length, 1);
  }
});

test('preflights use the same origin policy without storage or forwarding', async () => {
  const { handler, calls } = mockSubscriptionHandler();
  for (const [origin, statusCode] of [
    ['https://joetay.com', 204],
    ['https://deploy-preview-999--propertysg78.netlify.app', 204],
    ['https://evil.example', 403],
    ['null', 403],
    ['', 403],
  ]) {
    const response = await handler({ httpMethod: 'OPTIONS', headers: { origin }, body: '' });
    assert.equal(response.statusCode, statusCode);
  }
  const unsupported = await handler({ httpMethod: 'GET', headers: {} });
  assert.equal(unsupported.statusCode, 405);
  assert.deepEqual(calls, []);
});

test('trusted submissions still validate and apply the honeypot before delivery', async () => {
  const { handler, calls } = mockSubscriptionHandler();
  for (const [body, status] of [
    ['invalid JSON', 400],
    [JSON.stringify({}), 400],
    [JSON.stringify({ company_website: 'bot.example' }), 200],
  ]) {
    const response = await handler({ ...subscriptionEvent(), body });
    assert.equal(response.statusCode, status);
  }
  assert.deepEqual(calls, []);
});

test('trusted submissions preserve durable capture and retry after both channels fail', async () => {
  for (const scenario of [
    { storageSucceeds: true, webhookSucceeds: true, status: 200 },
    { storageSucceeds: true, webhookSucceeds: false, status: 200 },
    { storageSucceeds: false, webhookSucceeds: true, status: 200 },
    { storageSucceeds: false, webhookSucceeds: false, status: 502 },
    { blobsAvailable: false, webhookSucceeds: true, status: 200 },
    { blobsAvailable: false, webhookSucceeds: false, status: 502 },
  ]) {
    const { handler, calls } = mockSubscriptionHandler(scenario);
    const response = await handler(subscriptionEvent());
    assert.equal(response.statusCode, scenario.status, JSON.stringify(scenario));
    assert.equal(JSON.parse(response.body).ok, scenario.status === 200);
    const forwards = calls.filter(([name]) => name === 'postJson');
    assert.equal(forwards.length, 1);
    assert.equal(forwards[0][1], 'https://webhook.example.test/price-alert');
    assert.equal(forwards[0][2].full_name, 'Test Subscriber');
    assert.equal(forwards[0][2].mobile_number, 'subscriber@example.test');
    assert.equal(forwards[0][2].postal_code, '123456');
    assert.equal(forwards[0][2].lead_type, 'price_alert_subscription');
    if (scenario.blobsAvailable !== false) {
      const writes = calls.filter(([name]) => name === 'setJSON');
      assert.equal(writes.length, 1);
      assert.match(writes[0][1], /^123456:[a-f0-9]{16}$/);
      assert.equal(writes[0][2].contact, 'subscriber@example.test');
      assert.equal(writes[0][2].name, 'Test Subscriber');
      assert.equal(writes[0][2].source, 'neighbour-prices');
    }
  }
});
