// Netlify Function: subscribe-alert  (joetay.com)
//
// Stores a "tell me when a flat in my block sells" subscription from the
// neighbour-prices tool. v1 design: subscribers are matched against new
// transactions by the monthly alert-digest function, and the DIGEST GOES TO
// JOE (via the existing lead webhook → Sheets + email) so he follows up
// personally on WhatsApp. Nothing is ever sent to the subscriber directly,
// which keeps the PDPA surface small: one stored contact, used by one person.
//
// Storage: Netlify Blobs store "price-alerts", one JSON blob per
// subscription keyed by `${postal}:${sha1(contact)}`.

const crypto = require('crypto');

function getCorsHeaders(origin) {
  const allowed = (
    origin === 'https://joetay.com' ||
    origin === 'https://www.joetay.com' ||
    /^https:\/\/(?:[\w-]+--)?propertysg78\.netlify\.app$/.test(origin || '')
  );
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
  };
}

const okJson = (headers, code, body) => ({ statusCode: code, headers, body: JSON.stringify(body) });

function isPlausibleContact(c) {
  const s = String(c || '').trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s)) return true; // email
  const digits = s.replace(/[\s\-+]/g, '');
  return /^\d{8,15}$/.test(digits); // phone
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return okJson(corsHeaders, 405, { ok: false, error: 'Method not allowed' });

  let p;
  try { p = JSON.parse(event.body || '{}'); }
  catch { return okJson(corsHeaders, 400, { ok: false, error: 'Invalid JSON' }); }

  // Honeypot: pretend success so bots learn nothing.
  if (p.company_website || p.website_url) return okJson(corsHeaders, 200, { ok: true });

  const postal = String(p.postal_code || '').trim();
  const contact = String(p.contact || '').trim();
  const name = String(p.name || '').trim().slice(0, 80);
  const block = String(p.block || '').trim().slice(0, 12);
  const street = String(p.street_name || '').trim().slice(0, 64);
  const town = String(p.town || '').trim().slice(0, 32);

  if (!/^\d{6}$/.test(postal)) return okJson(corsHeaders, 400, { ok: false, error: 'Please enter a valid 6-digit postal code' });
  if (!isPlausibleContact(contact)) return okJson(corsHeaders, 400, { ok: false, error: 'Please enter a valid mobile number or email' });
  if (!name) return okJson(corsHeaders, 400, { ok: false, error: 'Please enter your name' });
  if (p.consent !== true && p.consent !== 1) return okJson(corsHeaders, 400, { ok: false, error: 'Please confirm consent so I can contact you about sales in your block' });

  // Blobs under the legacy (Lambda-compatible) function signature needs the
  // environment hydrated from the event via connectLambda() before getStore()
  // — without it, getStore throws MissingBlobsEnvironmentError and every
  // valid subscription 500s. If Blobs still fails, we fall through: the
  // webhook mirror below is the durability path, so the subscriber is never
  // lost — they just miss automated digest matching until re-added.
  let store = null;
  try {
    const blobs = await import('@netlify/blobs');
    if (typeof blobs.connectLambda === 'function') blobs.connectLambda(event);
    store = blobs.getStore('price-alerts');
  } catch (e) {
    console.error('Blobs unavailable, relying on webhook mirror:', e.message);
  }

  if (store) {
    try {
      // Soft rate limit: 5 subscriptions per IP per day.
      const ip = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown';
      const day = new Date().toISOString().slice(0, 10);
      const rlKey = `_rl:${day}:${crypto.createHash('sha1').update(ip).digest('hex').slice(0, 12)}`;
      const rl = Number(await store.get(rlKey)) || 0;
      if (rl >= 5) return okJson(corsHeaders, 200, { ok: true }); // silent, bot-shaped behavior
      await store.set(rlKey, String(rl + 1));

      const key = `${postal}:${crypto.createHash('sha1').update(contact.toLowerCase()).digest('hex').slice(0, 16)}`;
      await store.setJSON(key, {
        postal_code: postal, block, street_name: street, town,
        name, contact,
        created_at: new Date().toISOString(),
        source: 'neighbour-prices',
      });
    } catch (e) {
      console.error('Blobs write failed, relying on webhook mirror:', e.message);
    }
  }

  // Mirror into Joe's lead pipeline so the subscription is also a soft lead.
  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_type: 'price_alert_subscription',
          full_name: name, mobile_number: contact,
          postal_code: postal, block, street_name: street, town,
          source_site: 'joetay.com', landing_page: '/neighbour-prices/',
          submitted_at: new Date().toISOString(),
        }),
      });
    } catch (e) { console.warn('lead webhook mirror failed:', e.message); }
  }

  return okJson(corsHeaders, 200, { ok: true });
};
