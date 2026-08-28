import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESOURCE_CONTRACTS,
  runProductionFormHealth,
} from '../scripts/production-form-health.mjs';

const ORIGIN = 'https://joetay.com';

function fixtureFetch({ allowedOrigin = ORIGIN, omitMarker = '' } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url, method, body: options.body });

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { 'Access-Control-Allow-Origin': allowedOrigin },
      });
    }

    const path = new URL(url).pathname;
    const contract = RESOURCE_CONTRACTS.find((entry) => entry.path === path);
    const markers = contract?.markers.filter((marker) => marker !== omitMarker) || [];
    return new Response(markers.join('\n'), { status: contract ? 200 : 404 });
  };
  return { calls, fetchImpl };
}

test('production form health uses GET and OPTIONS only and never sends a body', async () => {
  const fixture = fixtureFetch();
  const result = await runProductionFormHealth({ fetchImpl: fixture.fetchImpl, log() {} });

  assert.equal(result.resources.length, RESOURCE_CONTRACTS.length);
  assert.equal(result.preflight, true);
  assert.deepEqual(new Set(fixture.calls.map((call) => call.method)), new Set(['GET', 'OPTIONS']));
  assert.ok(fixture.calls.every((call) => call.body === undefined));
  assert.equal(fixture.calls.filter((call) => call.method === 'OPTIONS').length, 1);
});

test('production form health fails when a recovery or form-contract marker disappears', async () => {
  const fixture = fixtureFetch({ omitMarker: 'valuation_form_recovery' });
  await assert.rejects(
    runProductionFormHealth({ fetchImpl: fixture.fetchImpl, log() {} }),
    /valuation\.html is missing required form marker: valuation_form_recovery/,
  );
});

test('production form health rejects an unexpected CORS origin', async () => {
  const fixture = fixtureFetch({ allowedOrigin: 'https://example.com' });
  await assert.rejects(
    runProductionFormHealth({ fetchImpl: fixture.fetchImpl, log() {} }),
    /unexpected Access-Control-Allow-Origin/,
  );
});
