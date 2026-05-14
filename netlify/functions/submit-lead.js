// Netlify Function: submit-lead  (joetay.com)
// Pipeline:
//   1. Reject obvious junk (honeypot, missing required fields, bad email pattern)
//   2. Rate-limit: 3/IP/hour, 1/email/day (Netlify Blobs persistent store)
//   3. (Optional) reCAPTCHA v3 score check — only enforced if RECAPTCHA_SECRET_KEY set
//      score < 0.5  → silently reject + log to spam
//      score < 0.7  → forward but flag as review_required (WhatsApp gets ⚠️ prefix)
//      score >= 0.7 → forward normally
//   4. Forward to LEAD_WEBHOOK_URL (Google Apps Script → Sheets + email)
//   5. Send Twilio WhatsApp via category-specific Meta template (with plain-text fallback)
//
// Spam-rejected submissions are logged to LEAD_SPAM_WEBHOOK_URL (separate Sheet)
// if set; otherwise to LEAD_WEBHOOK_URL with is_spam:true, otherwise to console.
//
// joetay.com has three distinct lead categories, each routed to its own Meta template:
//   - New-launch leads          → TWILIO_NEW_LAUNCH_CONTENT_SID
//   - Seller/landlord leads     → TWILIO_SELLER_LANDLORD_CONTENT_SID
//   - Valuation requests        → existing approved SID (override via TWILIO_VALUATION_CONTENT_SID)
// freevaluation.sg runs separately and uses its own template / env vars.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Return 200 OK to every rejected submission so bots don't get a clear signal.
const OK_RESPONSE = { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };

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

  const ip = getClientIp(event);
  const userAgent = event.headers['user-agent'] || '';

  // ─── Gate 1: Honeypot ──────────────────────────────────────────────
  if (payload.company_website || payload._honeypot) {
    await logSpam(event, payload, 'honeypot_triggered', ip);
    return OK_RESPONSE;
  }

  // ─── Gate 2: Required fields ───────────────────────────────────────
  const isNewsletterOnly = payload.lead_type === 'newsletter_signup';
  const fieldError = validateRequiredFields(payload, isNewsletterOnly);
  if (fieldError) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: fieldError }),
    };
  }

  // ─── Gate 3: Suspicious-email heuristics ───────────────────────────
  const emailValue = (payload.email || payload.email_address || '').trim().toLowerCase();
  const emailReason = checkSuspiciousEmail(emailValue);
  if (emailReason) {
    await logSpam(event, payload, emailReason, ip);
    return OK_RESPONSE;
  }

  // ─── Gate 4: Rate limiting ─────────────────────────────────────────
  const rate = await checkRateLimit(ip, emailValue);
  if (rate.blocked) {
    await logSpam(event, payload, rate.reason, ip);
    return OK_RESPONSE;
  }

  // ─── Gate 5: reCAPTCHA v3 (only enforced when secret configured) ──
  let recaptchaScore = null;
  let recaptchaError = null;
  if (process.env.RECAPTCHA_SECRET_KEY) {
    if (!payload.recaptcha_token) {
      // Token expected once site key deployed — log + silently drop
      await logSpam(event, payload, 'recaptcha_missing_token', ip);
      return OK_RESPONSE;
    }
    const result = await verifyRecaptcha(payload.recaptcha_token, ip);
    recaptchaScore = result.score;
    recaptchaError = result.error;

    if (recaptchaError || recaptchaScore === null) {
      await logSpam(event, payload, 'recaptcha_verify_failed:' + (recaptchaError || 'no_score'), ip);
      return OK_RESPONSE;
    }
    if (recaptchaScore < 0.5) {
      await logSpam(event, payload, 'recaptcha_low_score:' + recaptchaScore, ip);
      return OK_RESPONSE;
    }
  }

  const reviewRequired = recaptchaScore !== null && recaptchaScore < 0.7;

  // ─── Forward + notify ──────────────────────────────────────────────
  const enriched = {
    ...payload,
    source_site: payload.source_site || 'joetay.com',
    submitted_at: payload.submitted_at || new Date().toISOString(),
    user_agent: userAgent,
    referer: event.headers.referer || event.headers.referrer || '',
    client_ip: ip,
    recaptcha_score: recaptchaScore,
    review_required: reviewRequired,
  };

  const tasks = [];

  // 1. Webhook → Google Sheets + email
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

  // 2. Twilio WhatsApp (three branches as before — with optional ⚠️ prefix for review_required)
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

    const reviewPrefix = reviewRequired ? '⚠️ REVIEW BEFORE CALLING (recaptcha=' + recaptchaScore + ')\n\n' : '';

    let twilioBody;

    if (isNewLaunchLead) {
      const reqLabel = {
        vvip: 'VVIP Preview registration',
        ebrochure: 'E-Brochure request',
        interest: 'Register interest',
      }[enriched.request_type] || 'New-launch registration';

      if (process.env.TWILIO_NEW_LAUNCH_CONTENT_SID && !reviewRequired) {
        // Approved Meta template path (templates don't support dynamic prefixes,
        // so a review-flagged lead falls through to plain-text so Joe sees the ⚠️)
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
        const lines = [
          reviewPrefix + '🏢 NEW LAUNCH LEAD',
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
        const valuationSid = process.env.TWILIO_VALUATION_CONTENT_SID
          || 'HX591bf3c8cd3b596691067cda70b9b6b1';

        if (reviewRequired) {
          // Templates can't include a dynamic ⚠️ prefix → fall through to plain text
          const lines = [
            reviewPrefix + '💰 VALUATION REQUEST',
            '',
            'Name: ' + (enriched.full_name || 'Unknown'),
            'Contact: ' + (mobileAndEmail || 'Not provided'),
            'Property: ' + propertyDetail,
            'Address: ' + locationOrIntent,
            'Timeline: ' + timeline,
          ];
          twilioBody = new URLSearchParams({
            From: process.env.TWILIO_WHATSAPP_FROM,
            To: process.env.TWILIO_WHATSAPP_TO,
            Body: lines.join('\n'),
          });
        } else {
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
        }
      } else {
        const intentLabel = {
          seller_consult: 'Sell property',
          landlord_consult: 'Rent out property',
          consultation: 'General consultation',
          final_cta_consultation: 'General consultation',
        }[enriched.lead_type] || 'Property enquiry';

        if (process.env.TWILIO_SELLER_LANDLORD_CONTENT_SID && !reviewRequired) {
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
          const lines = [
            reviewPrefix + '🏡 SELLER / LANDLORD LEAD',
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

  console.log('Lead submission:', {
    lead_type: enriched.lead_type,
    name: enriched.full_name,
    mobile: enriched.mobile_number,
    source_site: enriched.source_site,
    recaptcha_score: recaptchaScore,
    review_required: reviewRequired,
    webhook_ok: webhookResult?.ok,
    webhook_status: webhookResult?.status,
    twilio_ok: twilioResult?.ok ?? 'skipped',
    twilio_status: twilioResult?.status ?? null,
    twilio_body: twilioResult?.body ? String(twilioResult.body).slice(0, 500) : null,
    tasks: results.length,
  });

  if (webhookResult && !webhookResult.ok) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Lead capture upstream failed' }),
    };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function getClientIp(event) {
  const xff = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'];
  if (xff) return xff.split(',')[0].trim();
  return event.headers['client-ip'] || event.headers['x-nf-client-connection-ip'] || '';
}

function validateRequiredFields(payload, isNewsletterOnly) {
  if (isNewsletterOnly) {
    if (!payload.email_address || !String(payload.email_address).trim()) {
      return 'Missing field: email_address';
    }
    return null;
  }

  if (!payload.full_name || !String(payload.full_name).trim()) {
    return 'Missing field: full_name';
  }

  const consultationLeadTypes = new Set([
    'consultation',
    'final_cta_consultation',
    'seller_consult',
    'landlord_consult',
    'new_launch_registration',
    'valuation',
  ]);
  if (consultationLeadTypes.has(payload.lead_type)) {
    if (!payload.mobile_number || !String(payload.mobile_number).trim()) {
      return 'Missing field: mobile_number';
    }
  } else if (!payload.mobile_number || !String(payload.mobile_number).trim()) {
    // Default: phone still required for any non-newsletter submission
    return 'Missing field: mobile_number';
  }

  return null;
}

function checkSuspiciousEmail(email) {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 0) return 'email_invalid_format';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // Rule: Gmail addresses with 4+ dots in local part (common spammer pattern —
  // Gmail ignores dots, so spammer farms generate variants like
  // j.o.h.n.s.m.i.t.h@gmail.com to spam the same inbox repeatedly).
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const dotCount = (local.match(/\./g) || []).length;
    if (dotCount >= 4) return 'email_gmail_excessive_dots';
  }

  // Rule: random consonant-cluster local part (e.g. xqzbvfr@…) — flag as bot.
  // 5+ consecutive consonants with no vowels in between.
  if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(local)) {
    return 'email_consonant_cluster';
  }

  // Rule: 8+ char local part with zero vowels at all — almost always garbage.
  if (local.length >= 8) {
    const vowels = (local.match(/[aeiouy]/gi) || []).length;
    if (vowels === 0) return 'email_no_vowels';
  }

  return null;
}

async function checkRateLimit(ip, email) {
  if (!ip && !email) return { blocked: false };

  let getStore;
  try {
    ({ getStore } = await import('@netlify/blobs'));
  } catch (err) {
    console.warn('Rate limit unavailable (Blobs import failed):', err.message);
    return { blocked: false }; // fail open — don't block real users on infra error
  }

  let store;
  try {
    store = getStore('rate-limits');
  } catch (err) {
    console.warn('Rate limit unavailable (getStore failed):', err.message);
    return { blocked: false };
  }

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;

  try {
    if (ip) {
      const ipKey = 'ip:' + ip.replace(/[^a-zA-Z0-9.:_-]/g, '_');
      const existing = (await store.get(ipKey, { type: 'json' })) || { timestamps: [] };
      const recent = (existing.timestamps || []).filter((t) => now - t < oneHour);
      if (recent.length >= 3) {
        return { blocked: true, reason: 'rate_limit_ip_hourly' };
      }
      recent.push(now);
      await store.setJSON(ipKey, { timestamps: recent });
    }

    if (email) {
      const emailKey = 'email:' + email.replace(/[^a-zA-Z0-9.@_-]/g, '_');
      const existing = (await store.get(emailKey, { type: 'json' })) || { timestamps: [] };
      const recent = (existing.timestamps || []).filter((t) => now - t < oneDay);
      if (recent.length >= 1) {
        return { blocked: true, reason: 'rate_limit_email_daily' };
      }
      recent.push(now);
      await store.setJSON(emailKey, { timestamps: recent });
    }
  } catch (err) {
    console.warn('Rate limit check threw:', err.message);
    return { blocked: false };
  }

  return { blocked: false };
}

async function verifyRecaptcha(token, ip) {
  try {
    const body = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY,
      response: token,
    });
    if (ip) body.append('remoteip', ip);

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json();
    if (!data.success) {
      return { score: null, error: (data['error-codes'] || []).join(',') || 'unknown' };
    }
    return { score: data.score, error: null };
  } catch (err) {
    return { score: null, error: err.message };
  }
}

async function logSpam(event, payload, reason, ip) {
  const spamRecord = {
    is_spam: true,
    spam_reason: reason,
    submitted_at: new Date().toISOString(),
    client_ip: ip,
    user_agent: event.headers['user-agent'] || '',
    referer: event.headers.referer || event.headers.referrer || '',
    payload: {
      lead_type: payload.lead_type,
      full_name: payload.full_name,
      mobile_number: payload.mobile_number,
      email: payload.email || payload.email_address,
      source_site: payload.source_site,
      landing_page: payload.landing_page,
    },
  };

  const target = process.env.LEAD_SPAM_WEBHOOK_URL || process.env.LEAD_WEBHOOK_URL;
  if (target) {
    try {
      await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spamRecord),
      });
    } catch (err) {
      console.warn('Spam-log webhook failed:', err.message);
    }
  }
  console.log('Spam rejected:', spamRecord);
}
