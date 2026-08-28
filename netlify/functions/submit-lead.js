// Netlify Function: submit-lead  (joetay.com)
// Pipeline (each gate either silently 200s or returns a real 400 to humans):
//   1. Honeypot (company_website / _honeypot / website_url) → silent 200
//   1b. Time-on-form (submits in < 3s when timestamp present) → silent 200
//   2. Required fields → 400 with "Missing field: …"
//   2b. Phone format (SG strict, or +CC international) → 400 with "Please enter a valid phone number"
//   3. Suspicious email (disposable provider / gmail dot abuse / digit cluster /
//      consonant cluster / vowel-less local) → silent 200
//   4. Rate-limit: 3/IP/hour, 3/email/day (Netlify Blobs persistent store) → silent 200
//   5. (Optional) reCAPTCHA v3 score + action/hostname binding — only enforced if RECAPTCHA_SECRET set:
//      < 0.5  → silent 200
//      < 0.7  → forward but flag review_required (WhatsApp gets ⚠️ prefix)
//      >= 0.7 → forward normally
//   6. Forward to LEAD_WEBHOOK_URL (Google Apps Script → Sheets + email)
//   7. Send Twilio WhatsApp via category-specific Meta template (with plain-text fallback)
//
// Spam-rejected submissions are logged to LEAD_SPAM_WEBHOOK_URL (separate Sheet)
// if set; otherwise to LEAD_WEBHOOK_URL with is_spam:true, otherwise to console.
//
// joetay.com has three distinct lead categories, each routed to its own Meta template:
//   - New-launch leads          → TWILIO_NEW_LAUNCH_CONTENT_SID
//   - Seller/landlord leads     → TWILIO_SELLER_LANDLORD_CONTENT_SID
//   - Valuation requests        → existing approved SID (override via TWILIO_VALUATION_CONTENT_SID)
// freevaluation.sg runs separately and uses its own template / env vars.

// Build per-request CORS headers based on the requesting Origin. Echoes the
// Origin back only if it's in the allow-list (joetay.com production + the
// deploy-preview / branch-deploy subdomains of this site, propertysg78 —
// not any *.netlify.app, which anyone can register). The handler also rejects
// disallowed browser origins before delivery; CORS alone would not prevent
// their POST from triggering side effects.
//
// Why echo instead of '*': '*' lets any third-party site embed a form that
// POSTs to this endpoint and pollutes Joe's lead pipeline (his quota, his
// Twilio template credits, his Sheets row count). Honeypot + time-on-form +
// reCAPTCHA still catch most abuse, but the browser-level origin check
// adds another layer with near-zero false positives.
//
// curl / Postman / cron jobs don't send an Origin header at all — those
// bypass the check, which is fine: they're trusted server-to-server callers.
function isAllowedOrigin(origin) {
  return (
    origin === 'https://joetay.com' ||
    origin === 'https://www.joetay.com' ||
    /^https:\/\/(?:[\w-]+--)?propertysg78\.netlify\.app$/.test(origin || '')
  );
}
exports.isAllowedOrigin = isAllowedOrigin;

function getCorsHeaders(origin) {
  const allowed = isAllowedOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
  };
}

const OBSERVABILITY_MARKER = 'ENQUIRY_OUTCOME';
const KNOWN_LEAD_TYPES = new Set([
  'consultation',
  'final_cta_consultation',
  'landlord_consult',
  'new_launch_registration',
  'newsletter_signup',
  'seller_consult',
  'valuation',
]);

function classifyLeadType(value) {
  if (!value) return 'unknown';
  return KNOWN_LEAD_TYPES.has(value) ? value : 'other';
}

function normalizeSpamReason(reason) {
  if (reason.startsWith('submitted_too_fast:')) return 'submitted_too_fast';
  if (reason.startsWith('recaptcha_low_score:')) return 'recaptcha_low_score';
  return reason;
}

function deliveryState(result) {
  if (result == null) return 'not_attempted';
  return result.ok === true ? 'succeeded' : 'failed';
}

// Build a deliberately low-cardinality event. Only the explicitly selected
// fields below can reach Netlify logs; names, contact details, IP addresses,
// free text, URLs, user agents and provider response bodies are excluded.
function buildEnquiryOutcome(outcome, details = {}) {
  const event = {
    event: 'enquiry_outcome',
    outcome,
    timestamp: new Date().toISOString(),
  };

  if (Object.hasOwn(details, 'leadType')) {
    event.lead_type = classifyLeadType(details.leadType);
  }
  if (details.reason) event.reason = normalizeSpamReason(details.reason);
  if (Number.isInteger(details.statusCode)) event.http_status = details.statusCode;
  if (typeof details.reviewRequired === 'boolean') {
    event.review_required = details.reviewRequired;
  }
  if (Object.hasOwn(details, 'webhookResult')) {
    event.webhook = deliveryState(details.webhookResult);
  }
  if (Object.hasOwn(details, 'twilioResult')) {
    event.twilio = deliveryState(details.twilioResult);
  }

  return event;
}
exports.buildEnquiryOutcome = buildEnquiryOutcome;

function logEnquiryOutcome(outcome, details) {
  console.log(OBSERVABILITY_MARKER + ' ' + JSON.stringify(buildEnquiryOutcome(outcome, details)));
}

exports.handler = async (event) => {
  // Hydrate Netlify Blobs for the legacy function signature — without this,
  // getStore() in checkRateLimit throws and the rate limit silently fails
  // open on every request (fail-open by design, but it should actually work).
  try {
    const blobs = await import('@netlify/blobs');
    if (typeof blobs.connectLambda === 'function') blobs.connectLambda(event);
  } catch (e) { console.warn('Blobs hydration failed:', e.message); }

  const requestOrigin = event.headers.origin || event.headers.Origin || '';
  const corsHeaders = getCorsHeaders(requestOrigin);
  const OK_RESPONSE = { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };

  if (event.httpMethod === 'OPTIONS') {
    logEnquiryOutcome('preflight', { statusCode: 204 });
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    logEnquiryOutcome('method_rejected', { statusCode: 405 });
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    logEnquiryOutcome('validation_rejected', { reason: 'invalid_json', statusCode: 400 });
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: 'Invalid JSON' }),
    };
  }

  const ip = getClientIp(event);
  const userAgent = event.headers['user-agent'] || '';

  // CORS only controls whether a browser can read a response. It does not stop
  // a cross-origin POST from reaching this function and triggering Joe's
  // webhook / WhatsApp notifications. Silently reject browser submissions
  // that are clearly from another site. Requests with no Origin remain
  // available to intentional server-to-server callers and still pass through
  // every other spam gate below.
  const secFetchSite = event.headers['sec-fetch-site'] || event.headers['Sec-Fetch-Site'] || '';
  if ((requestOrigin && !isAllowedOrigin(requestOrigin)) || secFetchSite === 'cross-site') {
    await logSpam(event, payload, 'cross_site_submission', ip);
    return OK_RESPONSE;
  }

  // ─── Gate 1: Honeypot ──────────────────────────────────────────────
  if (payload.company_website || payload._honeypot || payload.website_url) {
    await logSpam(event, payload, 'honeypot_triggered', ip);
    return OK_RESPONSE;
  }

  // ─── Gate 1b: Time-on-form ─────────────────────────────────────────
  // Client sends time_on_form_ms = Date.now() - page-load timestamp.
  // Real humans take 10+ seconds to fill the form; sub-3-second submits
  // are bots. Missing field = legacy/cached page → don't block.
  if (payload.time_on_form_ms != null) {
    const tOnForm = Number(payload.time_on_form_ms);
    if (Number.isFinite(tOnForm) && tOnForm < 3000) {
      await logSpam(event, payload, 'submitted_too_fast:' + tOnForm + 'ms', ip);
      return OK_RESPONSE;
    }
  }

  // ─── Gate 2: Required fields ───────────────────────────────────────
  const isNewsletterOnly = payload.lead_type === 'newsletter_signup';
  const fieldError = validateRequiredFields(payload, isNewsletterOnly);
  if (fieldError) {
    logEnquiryOutcome('validation_rejected', {
      leadType: payload.lead_type,
      reason: 'missing_required_field',
      statusCode: 400,
    });
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: fieldError }),
    };
  }

  // ─── Gate 2b: Singapore phone format ───────────────────────────────
  // Real 400 with friendly message — humans see it and can retry.
  if (!isNewsletterOnly && !isValidSingaporePhone(payload.mobile_number)) {
    logEnquiryOutcome('validation_rejected', {
      leadType: payload.lead_type,
      reason: 'invalid_phone',
      statusCode: 400,
    });
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: 'Please enter a valid phone number' }),
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
  //
  // Fail-open philosophy:
  //   - low score (< 0.5)              → silent drop (real bot signal)
  //   - missing token / verify error   → forward with review_required flag
  //
  // reCAPTCHA's JS CDN can be unavailable to legitimate users for reasons
  // that aren't bot-like — corporate firewall blocking google.com,
  // ad blocker stripping the script, regional restriction (mainland China,
  // some MEA networks), or the 4-second client-side wait timing out on
  // a slow mobile connection. Failing closed there silently drops real
  // leads with no recovery path: form shows success, lead never arrives.
  //
  // Forwarding with the review flag means Joe sees the lead with a ⚠️
  // prefix on his Twilio WhatsApp template and can judge for himself.
  let recaptchaScore = null;
  let recaptchaError = null;
  let recaptchaInvalidReason = null;
  let recaptchaAction = null;
  let recaptchaHostname = null;
  let recaptchaTokenMissing = false;
  if (process.env.RECAPTCHA_SECRET) {
    if (!payload.recaptcha_token) {
      recaptchaTokenMissing = true;
    } else {
      const result = await verifyRecaptcha(
        payload.recaptcha_token,
        ip,
        expectedRecaptchaAction(payload)
      );
      recaptchaScore = result.score;
      recaptchaError = result.error;
      recaptchaInvalidReason = result.invalidReason;
      recaptchaAction = result.action;
      recaptchaHostname = result.hostname;

      // An action/hostname mismatch is a valid token used in the wrong
      // context, which is a stronger bot/replay signal than a transient
      // verification error. Google explicitly recommends binding v3 tokens
      // to the expected action on the backend.
      if (recaptchaInvalidReason) {
        await logSpam(event, payload, recaptchaInvalidReason, ip);
        return OK_RESPONSE;
      }

      // Only drop on a real bot-score signal (< 0.5). Verify errors fall
      // through to review-required just like a missing token.
      if (recaptchaScore !== null && recaptchaScore < 0.5) {
        await logSpam(event, payload, 'recaptcha_low_score:' + recaptchaScore, ip);
        return OK_RESPONSE;
      }
    }
  }

  const reviewRequired =
    recaptchaTokenMissing ||
    !!recaptchaError ||
    (recaptchaScore !== null && recaptchaScore < 0.7);

  // ─── Forward + notify ──────────────────────────────────────────────
  const enriched = {
    ...payload,
    source_site: payload.source_site || 'joetay.com',
    // Server-side timestamp — never trust the client-provided submitted_at.
    // Spreading payload above means client_submitted_at is preserved as a
    // separate field for forensic comparison (a divergence between the two
    // can indicate clock skew on real users or, more interestingly, a bot
    // setting a stale value to evade time-on-form analysis).
    client_submitted_at: payload.submitted_at || null,
    submitted_at: new Date().toISOString(),
    user_agent: userAgent,
    referer: event.headers.referer || event.headers.referrer || '',
    client_ip: ip,
    recaptcha_score: recaptchaScore,
    recaptcha_action: recaptchaAction,
    recaptcha_hostname: recaptchaHostname,
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

  // 3. AgentOS copilot intake — deliberately OUTSIDE the `tasks` positional
  //    accounting and the partial-success policy below: AgentOS being slow or
  //    down must never affect lead delivery (Sheets/Twilio) or the visitor's
  //    response. Bounded at 5s; outcome is only logged. Inactive until the
  //    AGENTOS_LEAD_URL env var is set.
  let agentosTask = null;
  if (process.env.AGENTOS_LEAD_URL && !isNewsletterOnly) {
    agentosTask = fetch(process.env.AGENTOS_LEAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enriched),
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => ({ ok: r.ok, status: r.status }))
      .catch((err) => ({ ok: false, error: err.message }));
  }

  const results = await Promise.all(tasks);
  const webhookResult = process.env.LEAD_WEBHOOK_URL ? results[0] : null;
  const twilioResult = process.env.LEAD_WEBHOOK_URL ? results[1] : results[0];

  if (agentosTask) {
    const agentosResult = await agentosTask;
    if (!agentosResult.ok) {
      console.warn('AgentOS intake failed (non-blocking):', JSON.stringify(agentosResult));
    }
  }

  // Partial-success policy: return 200 OK if EITHER the webhook (Sheets) or
  // Twilio (WhatsApp) reached Joe. Only fail back to the user if BOTH paths
  // are down — then they get an error and can retry.
  //
  // Previous behaviour returned 502 whenever the Sheets webhook failed, even
  // if Twilio successfully fired Joe's WhatsApp. The user saw "Sorry, something
  // went wrong" and re-submitted, creating a duplicate WhatsApp notification.
  // Joe gets the lead twice, the user is confused, and the duplicate burns
  // one of his Meta-approved template quota slots.
  //
  // The structured outcome log below records each attempted channel without
  // putting lead PII or provider response bodies into Netlify's logs.
  const everythingFailed = computeEverythingFailed(webhookResult, twilioResult);
  if (everythingFailed) {
    logEnquiryOutcome('delivery_failed', {
      leadType: enriched.lead_type,
      statusCode: 502,
      reviewRequired,
      webhookResult,
      twilioResult,
    });
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: 'Lead capture upstream failed' }),
    };
  }

  const deliveryAttempted = webhookResult != null || twilioResult != null;
  logEnquiryOutcome(deliveryAttempted ? 'accepted' : 'delivery_not_configured', {
    leadType: enriched.lead_type,
    statusCode: 200,
    reviewRequired,
    webhookResult,
    twilioResult,
  });
  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
};

// ─── Helpers ───────────────────────────────────────────────────────────────

// Decides whether a lead was completely lost: true only when at least one
// delivery channel (webhook or Twilio) was actually attempted for this
// request AND every attempted channel failed. A channel that was never
// configured/attempted (result is null) must not count as a "pass" or a
// "fail" — it must be excluded, or an environment with only one channel
// configured (e.g. LEAD_WEBHOOK_URL unset, Twilio-only) can silently report
// success on 200 while its one and only attempted channel actually failed.
function computeEverythingFailed(webhookResult, twilioResult) {
  const webhookAttempted = webhookResult != null;
  const twilioAttempted = twilioResult != null && twilioResult !== webhookResult;
  const webhookOk = webhookAttempted && webhookResult.ok === true;
  const twilioOk = twilioAttempted && twilioResult.ok === true;
  return (webhookAttempted || twilioAttempted) && !webhookOk && !twilioOk;
}
exports.computeEverythingFailed = computeEverythingFailed;

function getClientIp(event) {
  // Netlify's edge sets x-nf-client-connection-ip to the real TCP peer it
  // observed for this request. The client cannot inject or forge it — it's
  // stamped by Netlify after they terminate the TLS connection.
  //
  // x-forwarded-for is unsafe to read first because a client can send their
  // own X-Forwarded-For header that Netlify appends to (not strips). Using
  // the leftmost XFF entry as the client IP lets attackers spoof the value
  // they want recorded — defeating the rate-limit gate (Gate 4) and
  // poisoning logSpam records.
  //
  // Order:
  //   1. x-nf-client-connection-ip (Netlify-authoritative; production)
  //   2. x-forwarded-for leftmost   (other reverse-proxy setups; fallback)
  //   3. client-ip                  (CloudFront-style; rare)
  if (event.headers['x-nf-client-connection-ip']) {
    return event.headers['x-nf-client-connection-ip'];
  }
  const xff = event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'];
  if (xff) return xff.split(',')[0].trim();
  return event.headers['client-ip'] || '';
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

// Disposable / throw-away email providers commonly used by spammers.
const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'guerrillamail.com', '10minutemail.com',
  'mailinator.com', 'throwawaymail.com', 'temp-mail.org',
  'fakeinbox.com', 'trashmail.com', 'maildrop.cc',
  'sharklasers.com', 'yopmail.com', 'spamgourmet.com',
  'getairmail.com', 'mintemail.com', 'dispostable.com',
]);

function checkSuspiciousEmail(email) {
  if (!email) return null;
  email = email.toLowerCase().trim();

  // Strict format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'email_invalid_format';
  }

  const at = email.indexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // Rule: disposable / throwaway provider → reject
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return 'email_disposable_domain';
  }

  // Rule: Gmail dot abuse — Gmail ignores dots, so spammer farms generate
  // variants like j.o.h.n.s.m.i.t.h@gmail.com to spam one inbox repeatedly.
  // 5+ segments (= 4+ dots) is the spec threshold.
  if (domain === 'gmail.com' && local.split('.').length > 4) {
    return 'email_gmail_dot_abuse';
  }

  // Rule: 6+ consecutive digits in local part is a strong bot signature
  // (e.g. "user123456@…", "abc999999@…").
  //
  // The threshold used to be 4+ but that caught extremely common legitimate
  // patterns — Singaporeans regularly use birth-year suffixes on Gmail
  // (john1995@…, mary2003@…, chen.weiqiang2023@…) and 4-digit phone-suffix
  // emails. The time-on-form + reCAPTCHA + honeypot gates already block
  // most bots; this is defence in depth, not the primary filter, so the
  // conservative tradeoff is to accept some borderline spam to avoid losing
  // real leads to silent rejection.
  if (/\d{6,}/.test(local)) {
    return 'email_digit_cluster';
  }

  // Defence-in-depth: random consonant-cluster local part (xqzbvfr@…)
  if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(local)) {
    return 'email_consonant_cluster';
  }

  // Defence-in-depth: 8+ char local part with zero vowels at all
  if (local.length >= 8) {
    const vowels = (local.match(/[aeiouy]/gi) || []).length;
    if (vowels === 0) return 'email_no_vowels';
  }

  return null;
}

// Accepts:
//   1) Singapore mobile: optional +65 prefix, then 8 digits starting with 6, 8, or 9.
//      Examples: 81881488, +65 8188 1488, 9123-4567
//   2) International: any other +<country code> followed by 6-15 digits.
//      Examples: +60 12 345 6789 (MY), +86 138 0013 8000 (CN), +1 415 555 0100 (US)
//
// The homepage final-CTA form has a 15-country code selector
// and concatenates `country_code + ' ' + phone` into mobile_number. Without the
// international branch below the server rejected every non-SG lead with
// "Please enter a valid Singapore phone number" — defeating the client-side
// fix shipped in PR #158.
function isValidSingaporePhone(phone) {
  if (!phone) return false;
  const trimmed = String(phone).trim();

  // International (any leading +CC where CC != 65) — loose digit-count check.
  if (/^\+(?!65[\s\-]?\d)/.test(trimmed)) {
    const digits = trimmed.replace(/[\s\-]/g, '').replace(/^\+/, '');
    return /^\d{8,15}$/.test(digits);
  }

  // Singapore mobile — strict.
  const cleaned = trimmed.replace(/[\s\-]/g, '').replace(/^\+65/, '');
  if (cleaned.length !== 8) return false;
  if (!/^[689]/.test(cleaned)) return false;
  if (!/^\d+$/.test(cleaned)) return false;
  return true;
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
      // 3 submissions per email per 24h. The previous limit of 1/day silently
      // blocked very common legitimate flows:
      //   - User submits, notices a typo, resubmits → blocked
      //   - Same user registering for a different project on the same day
      //     (browsing Newport, then Vela Bay) → blocked
      //   - User starts a valuation request, then later submits the final-CTA
      //     consultation form → blocked at the second
      //   - Couple sharing one email, each submitting for their own reason
      // 3/day still rejects obvious spam (4+ submissions from one email/day
      // is well outside any real-user pattern) and matches the IP limit.
      const emailKey = 'email:' + email.replace(/[^a-zA-Z0-9.@_-]/g, '_');
      const existing = (await store.get(emailKey, { type: 'json' })) || { timestamps: [] };
      const recent = (existing.timestamps || []).filter((t) => now - t < oneDay);
      if (recent.length >= 3) {
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

function expectedRecaptchaAction(payload) {
  return payload.lead_type
    ? String(payload.lead_type).replace(/[^a-zA-Z0-9_]/g, '_')
    : 'lead_submit';
}
exports.expectedRecaptchaAction = expectedRecaptchaAction;

function isAllowedRecaptchaHostname(hostname) {
  return (
    hostname === 'joetay.com' ||
    hostname === 'www.joetay.com' ||
    /^(?:[\w-]+--)?propertysg78\.netlify\.app$/.test(hostname || '')
  );
}
exports.isAllowedRecaptchaHostname = isAllowedRecaptchaHostname;

async function verifyRecaptcha(token, ip, expectedAction) {
  try {
    const body = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET,
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
      return {
        score: null,
        error: (data['error-codes'] || []).join(',') || 'unknown',
        invalidReason: null,
        action: data.action || null,
        hostname: data.hostname || null,
      };
    }
    if (data.action !== expectedAction) {
      return {
        score: data.score,
        error: null,
        invalidReason: 'recaptcha_action_mismatch',
        action: data.action || null,
        hostname: data.hostname || null,
      };
    }
    if (!isAllowedRecaptchaHostname(data.hostname)) {
      return {
        score: data.score,
        error: null,
        invalidReason: 'recaptcha_hostname_mismatch',
        action: data.action || null,
        hostname: data.hostname || null,
      };
    }
    return {
      score: data.score,
      error: null,
      invalidReason: null,
      action: data.action,
      hostname: data.hostname,
    };
  } catch (err) {
    return {
      score: null,
      error: err.message,
      invalidReason: null,
      action: null,
      hostname: null,
    };
  }
}

async function logSpam(event, payload, reason, ip) {
  const timestamp = new Date().toISOString();
  const spamRecord = {
    is_spam: true,
    spam_reason: reason,
    submitted_at: timestamp,
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
  logEnquiryOutcome('blocked', {
    leadType: payload.lead_type,
    reason,
    statusCode: 200,
  });
}
