/* joetay.com reCAPTCHA v3 helper + honeypot injector
 *
 * Loaded on every form page. Two responsibilities:
 *
 *   (a) Inject a `website_url` honeypot field into every <form> on the page
 *       (off-screen, aria-hidden, tabindex=-1). Bots that fill every field
 *       trip this and the backend silently rejects.
 *
 *   (b) Once the real Site Key is plugged in below AND `RECAPTCHA_SECRET` is
 *       set on Netlify, every form submission to /api/submit-lead or
 *       /.netlify/functions/submit-lead automatically picks up a fresh
 *       reCAPTCHA v3 token (action=lead_submit) via a transparent fetch wrapper.
 *       Existing form handlers stay untouched.
 */
(function () {
  var SITE_KEY = 'PLACEHOLDER_SITE_KEY';

  // ───── Honeypot injection ─────
  // Adds a hidden `website_url` field to every <form> on the page that
  // doesn't already have one. Runs as soon as the DOM is ready.
  function injectHoneypot() {
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      if (form.querySelector('input[name="website_url"]')) continue;
      var wrap = document.createElement('div');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.cssText = 'position:absolute;left:-9999px;top:-9999px;height:0;width:0;overflow:hidden';
      var lbl = document.createElement('label');
      lbl.htmlFor = 'website_url_' + i;
      lbl.textContent = 'Website (leave blank):';
      var input = document.createElement('input');
      input.type = 'text';
      input.id = 'website_url_' + i;
      input.name = 'website_url';
      input.tabIndex = -1;
      input.autocomplete = 'off';
      input.value = '';
      wrap.appendChild(lbl);
      wrap.appendChild(input);
      form.appendChild(wrap);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHoneypot);
  } else {
    injectHoneypot();
  }

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
    var labelled = action || 'lead_submit';
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

    var action = parsed.lead_type ? String(parsed.lead_type).replace(/[^a-zA-Z0-9_]/g, '_') : 'lead_submit';

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
