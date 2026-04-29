// Netlify Function: submit-lead  (joetay.com)
// Forwards lead data to LEAD_WEBHOOK_URL (Google Apps Script → Sheets + email)
// and sends a Twilio WhatsApp notification to Joe.
//
// joetay.com has three distinct lead categories, each routed to its own Meta template:
//   - New-launch leads          → TWILIO_NEW_LAUNCH_CONTENT_SID    (NEW template — needs Meta approval)
//   - Seller/landlord leads     → TWILIO_SELLER_LANDLORD_CONTENT_SID (NEW template — needs Meta approval)
//   - Valuation requests        → existing approved template (override via TWILIO_VALUATION_CONTENT_SID)
// freevaluation.sg runs separately and uses its own template / env vars.

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

  // 2. Twilio WhatsApp notification — three branches:
  //      lead_type = new_launch_registration         → TWILIO_NEW_LAUNCH_CONTENT_SID (plain-text fallback)
  //      lead_type = valuation                       → existing approved template (override via TWILIO_VALUATION_CONTENT_SID)
  //      everything else (seller/landlord/consult)   → TWILIO_SELLER_LANDLORD_CONTENT_SID (plain-text fallback)
  if (
    !isNewsletterOnly &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM &&
    process.env.TWILIO_WHATSAPP_TO
  ) {
    const isNewLaunchLead = enriched.lead_type === 'new_launch_registration';

    const mobileAndEmail = [enriched.mobile_number, enriched.email || enriched.email_address]
      .filter(Boolean).join(' / ');

    const auth = Buffer.from(
      process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN
    ).toString('base64');

    let twilioBody;

    if (isNewLaunchLead) {
      // Map request_type → human-readable label
      const reqLabel = {
        vvip: 'VVIP Preview registration',
        ebrochure: 'E-Brochure request',
        interest: 'Register interest',
      }[enriched.request_type] || 'New-launch registration';

      if (process.env.TWILIO_NEW_LAUNCH_CONTENT_SID) {
        // Approved Meta template — delivers regardless of session window
        const contentVariables = JSON.stringify({
          '1': enriched.project || 'Not specified',
          '2': reqLabel,
          '3': enriched.full_name || 'Unknown',
          '4': mobileAndEmail || 'Not provided',
          '5': enriched.interest || 'Not specified',
          '6': enriched.landing_page || enriched.source_site || 'joetay.com',
        });

        twilioBody = new URLSearchParams({
          From: process.env.TWILIO_WHATSAPP_FROM,
          To: process.env.TWILIO_WHATSAPP_TO,
          ContentSid: process.env.TWILIO_NEW_LAUNCH_CONTENT_SID,
          ContentVariables: contentVariables,
        });
      } else {
        // Fallback: plain-text body (works only inside the 24h session window)
        const lines = [
          '🏢 NEW LAUNCH LEAD',
          '',
          'Project: ' + (enriched.project || 'Not specified'),
          'Request: ' + reqLabel,
          'Name: ' + (enriched.full_name || 'Unknown'),
          'Contact: ' + (mobileAndEmail || 'Not provided'),
          'Bedroom: ' + (enriched.interest || 'Not specified'),
          'Page: ' + (enriched.landing_page || enriched.source_site || 'joetay.com'),
        ];
        if (enriched.utm_source) lines.push('UTM: ' + [enriched.utm_source, enriched.utm_medium, enriched.utm_campaign].filter(Boolean).join(' / '));

        twilioBody = new URLSearchParams({
          From: process.env.TWILIO_WHATSAPP_FROM,
          To: process.env.TWILIO_WHATSAPP_TO,
          Body: lines.join('\n'),
        });
      }
    } else {
      // Shared property/address/timeline computation for valuation + seller/landlord
      const propertyDetail = [
        enriched.property_type,
        enriched.hdb_type,
        enriched.year_built ? '(built ' + enriched.year_built + ')' : null,
      ].filter(Boolean).join(' ') || 'Not specified';

      const addressParts = [enriched.postal_code, enriched.detected_address, enriched.unit_number]
        .filter(Boolean).join(' ').trim();
      const locationOrIntent = addressParts
        || (enriched.intent ? 'Intent: ' + enriched.intent : 'Not specified');

      const timeline = enriched.selling_timeline || enriched.intent || 'Not specified';

      const isValuationLead = enriched.lead_type === 'valuation';

      if (isValuationLead) {
        // Valuation requests reuse Joe's existing approved template.
        // Override by setting TWILIO_VALUATION_CONTENT_SID if a different SID is ever wanted.
        const valuationSid = process.env.TWILIO_VALUATION_CONTENT_SID
          || 'HX591bf3c8cd3b596691067cda70b9b6b1';
        const contentVariables = JSON.stringify({
          '1': (enriched.source_site || 'joetay.com') + ' · ' + (enriched.full_name || 'Unknown'),
          '2': mobileAndEmail || 'Not provided',
          '3': propertyDetail,
          '4': locationOrIntent,
          '5': timeline,
        });
        twilioBody = new URLSearchParams({
          From: process.env.TWILIO_WHATSAPP_FROM,
          To: process.env.TWILIO_WHATSAPP_TO,
          ContentSid: valuationSid,
          ContentVariables: contentVariables,
        });
      } else {
        // Seller / landlord / general consultation lead
        const intentLabel = {
          seller_consult: 'Sell property',
          landlord_consult: 'Rent out property',
          consultation: 'General consultation',
          final_cta_consultation: 'General consultation',
        }[enriched.lead_type] || 'Property enquiry';

        if (process.env.TWILIO_SELLER_LANDLORD_CONTENT_SID) {
          const contentVariables = JSON.stringify({
            '1': intentLabel,
            '2': enriched.full_name || 'Unknown',
            '3': mobileAndEmail || 'Not provided',
            '4': propertyDetail,
            '5': locationOrIntent,
            '6': timeline,
            '7': enriched.landing_page || enriched.source_site || 'joetay.com',
          });
          twilioBody = new URLSearchParams({
            From: process.env.TWILIO_WHATSAPP_FROM,
            To: process.env.TWILIO_WHATSAPP_TO,
            ContentSid: process.env.TWILIO_SELLER_LANDLORD_CONTENT_SID,
            ContentVariables: contentVariables,
          });
        } else {
          // Fallback: plain-text body (only delivers inside the 24h session window)
          const lines = [
            '🏡 SELLER / LANDLORD LEAD',
            '',
            'Intent: ' + intentLabel,
            'Name: ' + (enriched.full_name || 'Unknown'),
            'Contact: ' + (mobileAndEmail || 'Not provided'),
            'Property: ' + propertyDetail,
            'Address: ' + locationOrIntent,
            'Timeline: ' + timeline,
            'Page: ' + (enriched.landing_page || enriched.source_site || 'joetay.com'),
          ];
          twilioBody = new URLSearchParams({
            From: process.env.TWILIO_WHATSAPP_FROM,
            To: process.env.TWILIO_WHATSAPP_TO,
            Body: lines.join('\n'),
          });
        }
      }
    }

    tasks.push(
      fetch(
        'https://api.twilio.com/2010-04-01/Accounts/' + process.env.TWILIO_ACCOUNT_SID + '/Messages.json',
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + auth,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: twilioBody.toString(),
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
