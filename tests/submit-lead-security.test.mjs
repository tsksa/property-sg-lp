import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedRecaptchaAction,
  handler,
  isAllowedOrigin,
  isAllowedRecaptchaHostname,
} from '../netlify/functions/submit-lead.js';

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
  console.warn = () => {};
  console.log = () => {};
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
