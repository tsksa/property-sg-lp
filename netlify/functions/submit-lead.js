// Netlify Function: submit-lead
// Forwards lead data to LEAD_WEBHOOK_URL (Google Apps Script → Sheets + email)
// and sends a Twilio WhatsApp notification to Joe. Matches freevaluation.sg's
// env var contract so the same webhook + Twilio numbers handle leads from both sites.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
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

  // Honeypot — bots fill these, humans don't.
  if (payload.company_website || payload._honeypot) {
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
  }

  // Newsletter-only signups skip mobile validation.
  const isNewsletterOnly = payload.lead_type === 'newsletter_signup';
  const required = isNewsletterOnly ? ['email_address'] : ['full_name', 'mobile_number'];
  for (const f of required) {
    if (!payload[f] || !String(payload[f]).trim()) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: `Missing field: ${f}` }),
      };
    }
  }

  const enriched = {
    ...payload,
    source_site: payload.source_site || 'joetay.com',
    submitted_at: payload.submitted_at || new Date().toISOString(),
    user_agent: event.headers['user-agent'] || '',
    referer: event.headers.referer || event.headers.referrer || '',
  };

  const tasks = [];

  // 1. Forward to webhook (Google Apps Script → Sheets + email)
  if (process.env.LEAD_WEBHOOK_URL) {
    tasks.push(
      fetch(process.env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enriched),
      })
        .then((r) => r.text().then((t) => ({ ok: r.ok, status: r.status, body: t })))
        .catch((err) => ({ ok: false, error: err.message }))
    );
  }

  // 2. Twilio WhatsApp notification to Joe — skip for newsletter-only signups
  if (
    !isNewsletterOnly &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM &&
    process.env.TWILIO_WHATSAPP_TO
  ) {
    const lines = [
      `*New lead — ${enriched.source_site}*`,
      `Type: ${enriched.lead_type || 'consultation'}`,
      `Name: ${enriched.full_name || '—'}`,
      `Mobile: ${enriched.mobile_number || '—'}`,
      enriched.email_address || enriched.email ? `Email: ${enriched.email_address || enriched.email}` : null,
      enriched.property_type ? `Property: ${enriched.property_type}` : null,
      enriched.postal_code ? `Postal: ${enriched.postal_code}` : null,
      enriched.detected_address ? `Address: ${enriched.detected_address}` : null,
      enriched.unit_number ? `Unit: ${enriched.unit_number}` : null,
      enriched.intent ? `Intent: ${enriched.intent}` : null,
      enriched.selling_timeline ? `Timeline: ${enriched.selling_timeline}` : null,
      enriched.utm_source ? `UTM: ${enriched.utm_source}/${enriched.utm_medium || ''}/${enriched.utm_campaign || ''}` : null,
    ].filter(Boolean);

    const body = lines.join('\n');
    const auth = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
    ).toString('base64');
    const form = new URLSearchParams({
      From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      To: `whatsapp:${process.env.TWILIO_WHATSAPP_TO}`,
      Body: body,
    });

    tasks.push(
      fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        }
      )
        .then((r) => r.text().then((t) => ({ ok: r.ok, status: r.status, body: t })))
        .catch((err) => ({ ok: false, error: err.message }))
    );
  }

  const results = await Promise.all(tasks);
  const webhookResult = process.env.LEAD_WEBHOOK_URL ? results[0] : null;
  const twilioResult = process.env.LEAD_WEBHOOK_URL ? results[1] : results[0];

  // Log for Netlify function logs (visible in Netlify dashboard)
  console.log('Lead submission:', {
    lead_type: enriched.lead_type,
    name: enriched.full_name,
    mobile: enriched.mobile_number,
    source_site: enriched.source_site,
    webhook_ok: webhookResult?.ok,
    webhook_status: webhookResult?.status,
    twilio_ok: twilioResult?.ok ?? 'skipped',
    twilio_status: twilioResult?.status ?? null,
    twilio_body: twilioResult?.body ? String(twilioResult.body).slice(0, 500) : null,
    tasks: results.length,
  });

  // Fail only if the webhook is configured and actually failed — Twilio is a nice-to-have.
  if (webhookResult && !webhookResult.ok) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Lead capture upstream failed' }),
    };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
};
