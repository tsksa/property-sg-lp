// Netlify Function: submit-lead
// Receives form submissions from valuation.html, index.html hero/final/exit forms.
// Matches the field naming used on freevaluation.sg so the real integration logic
// (Twilio WhatsApp notify, Google Sheets append, email) can be copied over directly.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // Tighten to 'https://propertysg.sg' after custom domain is set
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Invalid JSON' }),
    };
  }

  // Honeypot — bots fill these, humans don't. Return 200 so bots don't retry.
  if (payload.company_website || payload._honeypot) {
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  }

  // Minimal validation
  const required = ['full_name', 'mobile_number'];
  for (const f of required) {
    if (!payload[f] || !String(payload[f]).trim()) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: `Missing field: ${f}` }),
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // TODO: paste the integration logic from your freevaluation.sg
  // submit-lead function here. It will almost certainly contain:
  //
  //   1. Twilio WhatsApp — notify your team of the new lead
  //      const twilio = require('twilio')(
  //        process.env.TWILIO_ACCOUNT_SID,
  //        process.env.TWILIO_AUTH_TOKEN
  //      );
  //      await twilio.messages.create({
  //        from: `whatsapp:${process.env.TWILIO_WA_FROM}`,
  //        to:   `whatsapp:${process.env.NOTIFY_TO}`,
  //        body: `New lead: ${payload.full_name} (${payload.mobile_number})`
  //      });
  //
  //   2. Google Sheets — append a row
  //      (via googleapis or a Sheets webhook integration)
  //
  //   3. Email via SendGrid / Mailgun
  //
  // Set env vars in Netlify: Site → Settings → Environment variables.
  // ──────────────────────────────────────────────────────────────────

  console.log('New lead:', {
    lead_type: payload.lead_type || 'unknown',
    name: payload.full_name,
    mobile: payload.mobile_number,
    property_type: payload.property_type,
    postal_code: payload.postal_code,
    timeline: payload.selling_timeline,
    utm: {
      source: payload.utm_source,
      medium: payload.utm_medium,
      campaign: payload.utm_campaign,
    },
  });

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ ok: true }),
  };
};
