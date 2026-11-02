import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEnquiryOutcome,
  expectedRecaptchaAction,
  handler,
  isAllowedOrigin,
  isAllowedRecaptchaHostname,
} from '../netlify/functions/submit-lead.js';

const parseOutcome = (line) => JSON.parse(line.replace(/^ENQUIRY_OUTCOME /, ''));

test('lead endpoint accepts only joetay.com and this Netlify site as browser origins', () => {
  for (const origin of [
    'https://joetay.com',
    'https://www.joetay.com',
    'https://propertysg78.netlify.app',
    'https://deploy-preview-999--propertysg78.netlify.app',
  ]) {
    assert.equal(isAllowedOrigin(origin), true, origin);
  }

  for (const origin of [
    'https://evil.example',
    'https://propertysg78.netlify.app.evil.example',
    'http://joetay.com',
    '',
  ]) {
    assert.equal(isAllowedOrigin(origin), false, origin || '(empty origin)');
  }
});

test('reCAPTCHA hostname must belong to joetay.com or this Netlify site', () => {
  for (const hostname of [
    'joetay.com',
    'www.joetay.com',
    'propertysg78.netlify.app',
    'deploy-preview-999--propertysg78.netlify.app',
  ]) {
    assert.equal(isAllowedRecaptchaHostname(hostname), true, hostname);
  }

  for (const hostname of ['evil.example', 'joetay.com.evil.example', '']) {
    assert.equal(isAllowedRecaptchaHostname(hostname), false, hostname || '(empty hostname)');
  }
});

test('expected reCAPTCHA action is derived server-side from the lead type', () => {
  assert.equal(expectedRecaptchaAction({ lead_type: 'seller_consult' }), 'seller_consult');
  assert.equal(expectedRecaptchaAction({ lead_type: 'new-launch registration' }), 'new_launch_registration');
  assert.equal(expectedRecaptchaAction({}), 'lead_submit');
});

test('structured enquiry outcomes are low-cardinality and exclude PII', () => {
  const outcome = buildEnquiryOutcome('blocked', {
    leadType: 'seller_consult',
    reason: 'submitted_too_fast:125ms',
    statusCode: 200,
    fullName: 'Private Person',
    mobileNumber: '91234567',
    email: 'private@example.com',
    ip: '203.0.113.10',
    providerBody: 'sensitive upstream response',
  });

  assert.equal(outcome.event, 'enquiry_outcome');
  assert.equal(outcome.outcome, 'blocked');
  assert.equal(outcome.lead_type, 'seller_consult');
  assert.equal(outcome.reason, 'submitted_too_fast');
  assert.equal(outcome.http_status, 200);
  const serialized = JSON.stringify(outcome);
  for (const privateValue of [
    'Private Person',
    '91234567',
    'private@example.com',
    '203.0.113.10',
    'sensitive upstream response',
  ]) {
    assert.doesNotMatch(serialized, new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('preflight and human validation exits emit explicit outcome codes', async () => {
  const originalWarn = console.warn;
  const originalLog = console.log;
  const logs = [];
  console.warn = () => {};
  console.log = (...args) => logs.push(args.join(' '));

  try {
    const preflight = await handler({ httpMethod: 'OPTIONS', headers: {}, body: '' });
    const invalid = await handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({ lead_type: 'seller_consult' }),
    });

    assert.equal(preflight.statusCode, 204);
    assert.equal(invalid.statusCode, 400);
    const outcomes = logs
      .filter((line) => line.startsWith('ENQUIRY_OUTCOME '))
      .map(parseOutcome);
    assert.deepEqual(
      outcomes.map(({ outcome, reason, http_status: httpStatus }) => ({
        outcome,
        reason,
        httpStatus,
      })),
      [
        { outcome: 'preflight', reason: undefined, httpStatus: 204 },
        { outcome: 'validation_rejected', reason: 'missing_required_field', httpStatus: 400 },
      ],
    );
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
});

test('cross-site browser submission is silently dropped before delivery', async () => {
  const originalFetch = global.fetch;
  const originalWebhook = process.env.LEAD_WEBHOOK_URL;
  const originalSpamWebhook = process.env.LEAD_SPAM_WEBHOOK_URL;
  const originalRecaptchaSecret = process.env.RECAPTCHA_SECRET;
  const originalWarn = console.warn;
  const originalLog = console.log;
  let deliveryCalls = 0;

  delete process.env.LEAD_WEBHOOK_URL;
  delete process.env.LEAD_SPAM_WEBHOOK_URL;
  delete process.env.RECAPTCHA_SECRET;
  const logs = [];
  console.warn = () => {};
  console.log = (...args) => logs.push(args.join(' '));
  global.fetch = async () => {
    deliveryCalls += 1;
    throw new Error('cross-site submission reached delivery');
  };

  try {
    const response = await handler({
      httpMethod: 'POST',
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
        'user-agent': 'test-agent',
        'x-nf-client-connection-ip': '203.0.113.10',
      },
      body: JSON.stringify({
        full_name: 'Bot Submission',
        mobile_number: '91234567',
        lead_type: 'seller_consult',
        time_on_form_ms: 10000,
      }),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).ok, true);
    assert.equal(deliveryCalls, 0);
    const outcomeLines = logs.filter((line) => line.startsWith('ENQUIRY_OUTCOME '));
    assert.equal(outcomeLines.length, 1);
    assert.deepEqual(
      { ...parseOutcome(outcomeLines[0]), timestamp: '<timestamp>' },
      {
        event: 'enquiry_outcome',
        outcome: 'blocked',
        timestamp: '<timestamp>',
        lead_type: 'seller_consult',
        reason: 'cross_site_submission',
        http_status: 200,
      },
    );
    assert.doesNotMatch(outcomeLines[0], /Bot Submission|91234567|203\.0\.113\.10/);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    console.log = originalLog;
    if (originalWebhook === undefined) delete process.env.LEAD_WEBHOOK_URL;
    else process.env.LEAD_WEBHOOK_URL = originalWebhook;
    if (originalSpamWebhook === undefined) delete process.env.LEAD_SPAM_WEBHOOK_URL;
    else process.env.LEAD_SPAM_WEBHOOK_URL = originalSpamWebhook;
    if (originalRecaptchaSecret === undefined) delete process.env.RECAPTCHA_SECRET;
    else process.env.RECAPTCHA_SECRET = originalRecaptchaSecret;
  }
});

test('raw reCAPTCHA tokens reach Google verification only, never lead delivery', async (t) => {
  const token = 'synthetic-private-recaptcha-token';
  const verified = { success: true, score: 0.9, action: 'landlord_consult', hostname: 'joetay.com' };
  const scenarios = [
    { name: 'verified landlord', verification: verified, review: false },
    { name: 'review-required score', verification: { ...verified, score: 0.6 }, review: true },
    { name: 'verification unavailable', verificationError: true, review: true },
    { name: 'secret not configured', noSecret: true, review: false },
    { name: 'token missing', noToken: true, review: true },
    { name: 'low score blocked', verification: { ...verified, score: 0.1 }, blocked: true },
    { name: 'wrong action blocked', verification: { ...verified, action: 'valuation' }, blocked: true },
    { name: 'wrong hostname blocked', verification: { ...verified, hostname: 'example.test' }, blocked: true },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async (t) => {
      const env = {
        LEAD_WEBHOOK_URL: 'https://webhook.example.test/lead',
        LEAD_SPAM_WEBHOOK_URL: 'https://webhook.example.test/spam',
        AGENTOS_LEAD_URL: 'https://agentos.example.test/lead',
        RECAPTCHA_SECRET: 'synthetic-secret',
        TWILIO_ACCOUNT_SID: 'test',
        TWILIO_AUTH_TOKEN: 'test',
        TWILIO_WHATSAPP_FROM: 'whatsapp:+6500000000',
        TWILIO_WHATSAPP_TO: 'whatsapp:+6500000001',
        TWILIO_SELLER_LANDLORD_CONTENT_SID: 'test-template',
      };
      const originalEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
      const calls = [];
      const logs = [];
      t.mock.method(console, 'warn', (...args) => logs.push(args.join(' ')));
      t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
      t.mock.method(global, 'fetch', async (url, options) => {
        calls.push({ url: String(url), body: options.body });
        if (url === 'https://www.google.com/recaptcha/api/siteverify') {
          assert.equal(new URLSearchParams(options.body).get('response'), token);
          if (scenario.verificationError) throw new Error('verification unavailable');
          return { json: async () => scenario.verification };
        }
        return { ok: true, status: 200, text: async () => '{}' };
      });
      try {
        Object.assign(process.env, env);
        if (scenario.noSecret) delete process.env.RECAPTCHA_SECRET;
        const response = await handler({
          httpMethod: 'POST',
          headers: { origin: 'https://joetay.com' },
          body: JSON.stringify({
            full_name: 'Test landlord', mobile_number: '91234567',
            lead_type: 'landlord_consult', property_type: 'HDB',
            newsletter_opt_in: 0, time_on_form_ms: 10000,
            utm_campaign: 'redaction_test',
            ...(scenario.noToken ? {} : { recaptcha_token: token }),
          }),
        });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(JSON.parse(response.body), { ok: true });
        const verificationCalls = calls.filter(call => call.url.includes('/siteverify'));
        assert.equal(verificationCalls.length, scenario.noSecret || scenario.noToken ? 0 : 1);
        if (verificationCalls.length) assert.equal(calls[0], verificationCalls[0], 'verify before forwarding');
        const downstream = calls.filter(call => !call.url.includes('/siteverify'));
        assert.equal(downstream.length, scenario.blocked ? 1 : 3);
        for (const call of downstream) {
          assert.ok(!call.body.includes(token), `${call.url} must not receive the token`);
          assert.ok(!call.body.includes('recaptcha_token'), `${call.url} must not receive the token field`);
        }
        if (scenario.blocked) {
          assert.equal(downstream[0].url, env.LEAD_SPAM_WEBHOOK_URL);
          assert.equal(JSON.parse(downstream[0].body).is_spam, true);
        } else {
          for (const url of [env.LEAD_WEBHOOK_URL, env.AGENTOS_LEAD_URL]) {
            const forwarded = JSON.parse(downstream.find(call => call.url === url).body);
            assert.equal(forwarded.full_name, 'Test landlord');
            assert.equal(forwarded.mobile_number, '91234567');
            assert.equal(forwarded.property_type, 'HDB');
            assert.equal(forwarded.utm_campaign, 'redaction_test');
            assert.equal(forwarded.newsletter_opt_in, 0);
            assert.equal(forwarded.review_required, scenario.review);
            assert.equal(forwarded.recaptcha_score, scenario.verification?.score ?? null);
            assert.equal(forwarded.recaptcha_action, scenario.verification?.action ?? null);
            assert.equal(forwarded.recaptcha_hostname, scenario.verification?.hostname ?? null);
          }
          assert.ok(downstream.some(call => call.url.startsWith('https://api.twilio.com/')));
        }
        assert.ok(!response.body.includes(token));
        assert.ok(!logs.join('\n').includes(token));
      } finally {
        for (const [key, value] of Object.entries(originalEnv)) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
      }
    });
  }
});
