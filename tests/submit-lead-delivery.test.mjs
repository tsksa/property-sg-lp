import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEnquiryOutcome,
  computeEverythingFailed,
  handler,
} from '../netlify/functions/submit-lead.js';

const parseOutcome = (line) => JSON.parse(line.replace(/^ENQUIRY_OUTCOME /, ''));

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

test('delivery outcome exposes channel health without provider bodies', () => {
  const outcome = buildEnquiryOutcome('accepted', {
    leadType: 'valuation',
    statusCode: 200,
    reviewRequired: false,
    webhookResult: { ok: true, status: 200, body: 'private webhook response' },
    twilioResult: { ok: false, status: 400, body: 'private Twilio response' },
    agentosResult: { ok: false, status: 503, error: 'private agentos error' },
  });

  assert.equal(outcome.webhook, 'succeeded');
  assert.equal(outcome.twilio, 'failed');
  assert.equal(outcome.agentos, 'failed');
  assert.doesNotMatch(JSON.stringify(outcome), /private webhook response|private Twilio response|private agentos error/);
});

test('handler logs accepted and completely failed deliveries without lead PII', async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalEnv = {
    LEAD_WEBHOOK_URL: process.env.LEAD_WEBHOOK_URL,
    AGENTOS_LEAD_URL: process.env.AGENTOS_LEAD_URL,
    RECAPTCHA_SECRET: process.env.RECAPTCHA_SECRET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    TWILIO_WHATSAPP_TO: process.env.TWILIO_WHATSAPP_TO,
  };
  const logs = [];
  let webhookSucceeds = true;

  process.env.LEAD_WEBHOOK_URL = 'https://webhook.example.test/lead';
  delete process.env.AGENTOS_LEAD_URL;
  delete process.env.RECAPTCHA_SECRET;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.TWILIO_WHATSAPP_TO;
  console.warn = () => {};
  console.log = (...args) => logs.push(args.join(' '));
  global.fetch = async () => ({
    ok: webhookSucceeds,
    status: webhookSucceeds ? 200 : 503,
    text: async () => 'private provider response',
  });

  const event = {
    httpMethod: 'POST',
    headers: {
      'user-agent': 'test-agent',
      'x-nf-client-connection-ip': '203.0.113.25',
    },
    body: JSON.stringify({
      full_name: 'Private Person',
      mobile_number: '91234567',
      email: 'private@example.com',
      lead_type: 'valuation',
      time_on_form_ms: 10000,
    }),
  };

  try {
    const acceptedResponse = await handler(event);
    assert.equal(acceptedResponse.statusCode, 200);

    webhookSucceeds = false;
    const failedResponse = await handler({
      ...event,
      headers: { ...event.headers, 'x-nf-client-connection-ip': '203.0.113.26' },
    });
    assert.equal(failedResponse.statusCode, 502);

    const outcomes = logs
      .filter((line) => line.startsWith('ENQUIRY_OUTCOME '))
      .map(parseOutcome);
    assert.deepEqual(outcomes.map(({ outcome }) => outcome), ['accepted', 'delivery_failed']);
    assert.deepEqual(
      outcomes.map(({ webhook, twilio, agentos }) => ({ webhook, twilio, agentos })),
      [
        { webhook: 'succeeded', twilio: 'not_attempted', agentos: 'not_attempted' },
        { webhook: 'failed', twilio: 'not_attempted', agentos: 'not_attempted' },
      ],
    );
    const serialized = JSON.stringify(outcomes);
    assert.doesNotMatch(
      serialized,
      /Private Person|91234567|private@example\.com|203\.0\.113\.(25|26)|private provider response/,
    );
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    console.log = originalLog;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

function leadEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      'user-agent': 'test-agent',
      'x-nf-client-connection-ip': '203.0.113.40',
      ...overrides.headers,
    },
    body: JSON.stringify({
      full_name: 'Private Person',
      mobile_number: '91234567',
      email: 'private@example.com',
      lead_type: 'valuation',
      time_on_form_ms: 10000,
      ...overrides.body,
    }),
  };
}

test('AgentOS POST fires in parallel with Sheet and soft-fails without blocking 200', async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalEnv = {
    LEAD_WEBHOOK_URL: process.env.LEAD_WEBHOOK_URL,
    AGENTOS_LEAD_URL: process.env.AGENTOS_LEAD_URL,
    RECAPTCHA_SECRET: process.env.RECAPTCHA_SECRET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    TWILIO_WHATSAPP_TO: process.env.TWILIO_WHATSAPP_TO,
  };
  const logs = [];
  const warns = [];
  const fetches = [];

  process.env.LEAD_WEBHOOK_URL = 'https://webhook.example.test/lead';
  process.env.AGENTOS_LEAD_URL = 'https://agentos.example.test/lead?token=placeholder';
  delete process.env.RECAPTCHA_SECRET;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.TWILIO_WHATSAPP_TO;
  console.warn = (...args) => warns.push(args.join(' '));
  console.log = (...args) => logs.push(args.join(' '));
  global.fetch = async (url, options = {}) => {
    fetches.push({ url, method: options.method, body: options.body });
    if (String(url).includes('agentos.example.test')) {
      return { ok: false, status: 503, text: async () => 'private agentos body' };
    }
    return { ok: true, status: 200, text: async () => 'private webhook response' };
  };

  try {
    const response = await handler(leadEvent());
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).ok, true);

    const agentosCalls = fetches.filter((call) => String(call.url).includes('agentos.example.test'));
    const sheetCalls = fetches.filter((call) => String(call.url).includes('webhook.example.test'));
    assert.equal(agentosCalls.length, 1);
    assert.equal(sheetCalls.length, 1);
    assert.equal(agentosCalls[0].method, 'POST');
    const agentosBody = JSON.parse(agentosCalls[0].body);
    assert.equal(agentosBody.full_name, 'Private Person');
    assert.equal(agentosBody.mobile_number, '91234567');
    assert.equal(agentosBody.source_site, 'joetay.com');

    assert.equal(
      warns.some((line) => line.includes('AgentOS intake failed (non-blocking)')),
      true,
    );

    const outcomes = logs
      .filter((line) => line.startsWith('ENQUIRY_OUTCOME '))
      .map(parseOutcome);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].outcome, 'accepted');
    assert.equal(outcomes[0].webhook, 'succeeded');
    assert.equal(outcomes[0].agentos, 'failed');
    assert.doesNotMatch(
      JSON.stringify(outcomes),
      /Private Person|91234567|private@example\.com|placeholder|private agentos body|private webhook response/,
    );
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    console.log = originalLog;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('newsletter_signup does not POST AgentOS', async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalEnv = {
    LEAD_WEBHOOK_URL: process.env.LEAD_WEBHOOK_URL,
    AGENTOS_LEAD_URL: process.env.AGENTOS_LEAD_URL,
    RECAPTCHA_SECRET: process.env.RECAPTCHA_SECRET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    TWILIO_WHATSAPP_TO: process.env.TWILIO_WHATSAPP_TO,
  };
  const fetches = [];

  process.env.LEAD_WEBHOOK_URL = 'https://webhook.example.test/lead';
  process.env.AGENTOS_LEAD_URL = 'https://agentos.example.test/lead?token=placeholder';
  delete process.env.RECAPTCHA_SECRET;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.TWILIO_WHATSAPP_TO;
  console.warn = () => {};
  console.log = () => {};
  global.fetch = async (url, options = {}) => {
    fetches.push({ url, method: options.method });
    return { ok: true, status: 200, text: async () => 'ok' };
  };

  try {
    const response = await handler({
      httpMethod: 'POST',
      headers: {
        'user-agent': 'test-agent',
        'x-nf-client-connection-ip': '203.0.113.41',
      },
      body: JSON.stringify({
        email_address: 'nurture@example.com',
        lead_type: 'newsletter_signup',
        time_on_form_ms: 10000,
      }),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(fetches.some((call) => String(call.url).includes('agentos.example.test')), false);
    assert.equal(fetches.some((call) => String(call.url).includes('webhook.example.test')), true);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    console.log = originalLog;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
