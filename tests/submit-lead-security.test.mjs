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
