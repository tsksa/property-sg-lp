/* joetay.com reCAPTCHA v3 helper
 *
 * Loaded on every form page. Once the real Site Key is plugged in below
 * (single one-line change) AND `RECAPTCHA_SECRET_KEY` is set on Netlify,
 * every form submission to /api/submit-lead or /.netlify/functions/submit-lead
 * automatically picks up a fresh reCAPTCHA v3 token — no form-handler changes
 * needed.
 *
 * Approach: drop a global `window.getRecaptchaToken(action)` helper AND a
 * transparent `fetch` wrapper that injects `recaptcha_token` + `recaptcha_action`
 * into the JSON body of any POST to the lead-capture endpoints. This keeps
 * the existing form code untouched.
 */
(function () {
  var SITE_KEY = 'PLACEHOLDER_SITE_KEY';

  function isPlaceholder() {
    return !SITE_KEY || SITE_KEY === 'PLACEHOLDER_SITE_KEY';
  }

  function isLeadEndpoint(url) {
    if (typeof url !== 'string') return false;
    return url.indexOf('/submit-lead') !== -1
      || url.indexOf('/.netlify/functions/submit-lead') !== -1
      || url.indexOf('/api/submit-lead') !== -1;
  }

  // ───── No-op stub while the placeholder key is in place ─────
  // Keeps the JS surface identical so form code doesn't have to branch.
  if (isPlaceholder()) {
    window.getRecaptchaToken = function () { return Promise.resolve(null); };
    return;
  }

  // ───── Real wiring ─────
  var script = document.createElement('script');
  script.src = 'https://www.google.com/recaptcha/api.js?render=' + encodeURIComponent(SITE_KEY);
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);

  function waitForGrecaptcha() {
    return new Promise(function (resolve) {
      if (window.grecaptcha && window.grecaptcha.ready) return resolve();
      var waited = 0;
      var iv = setInterval(function () {
        waited += 100;
        if (window.grecaptcha && window.grecaptcha.ready) {
          clearInterval(iv); resolve();
        } else if (waited >= 4000) {
          clearInterval(iv); resolve(); // give up gracefully — token will be null
        }
      }, 100);
    });
  }

  window.getRecaptchaToken = function (action) {
    var labelled = action || 'submit_lead';
    return waitForGrecaptcha().then(function () {
      if (!window.grecaptcha) return null;
      return new Promise(function (resolve) {
        try {
          window.grecaptcha.ready(function () {
            window.grecaptcha
              .execute(SITE_KEY, { action: labelled })
              .then(resolve)
              .catch(function (err) {
                console.warn('recaptcha execute failed:', err);
                resolve(null);
              });
          });
        } catch (err) {
          console.warn('recaptcha unexpected error:', err);
          resolve(null);
        }
      });
    });
  };

  // ───── Transparent fetch interceptor ─────
  // Wraps the global `fetch` so that any POST to /submit-lead picks up a fresh
  // reCAPTCHA token in its JSON body. Non-lead requests pass through unchanged.
  var originalFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!originalFetch) return; // very old browser — bail out, server-side will drop submission

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

    if (method !== 'POST' || !isLeadEndpoint(url)) {
      return originalFetch(input, init);
    }

    // Only attempt to inject if the body is a JSON string (the existing forms
    // all use `body: JSON.stringify(data)`). Leave any other body shape alone.
    var body = init && init.body;
    if (typeof body !== 'string') return originalFetch(input, init);

    var parsed;
    try { parsed = JSON.parse(body); } catch (e) { return originalFetch(input, init); }
    if (!parsed || typeof parsed !== 'object') return originalFetch(input, init);

    var action = parsed.lead_type ? String(parsed.lead_type).replace(/[^a-zA-Z0-9_]/g, '_') : 'submit_lead';

    return window.getRecaptchaToken(action).then(function (token) {
      if (token) {
        parsed.recaptcha_token = token;
        parsed.recaptcha_action = action;
      }
      var nextInit = {};
      if (init) for (var k in init) if (Object.prototype.hasOwnProperty.call(init, k)) nextInit[k] = init[k];
      nextInit.body = JSON.stringify(parsed);
      return originalFetch(input, nextInit);
    }).catch(function (err) {
      console.warn('recaptcha token interception failed, sending without token:', err);
      return originalFetch(input, init);
    });
  };
})();
