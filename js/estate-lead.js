// Lead capture for the /hdb-prices/<town>/ estate pages.
//
// These pages are the site's highest-intent organic entry points — someone
// reading their own town's resale median is usually a seller sizing up a move —
// but they carried no form and no WhatsApp link, so that intent had nowhere to
// go. One shared handler rather than 26 inline copies.
//
// Loaded alongside /js/recaptcha-helper.js, which injects the honeypot and
// supplies window.getRecaptchaToken.
(function () {
  'use strict';

  // The seller block's sold-price lookup is assets/block-estimate.js, three
  // module requests. Loading them with the page cost about 0.3s of LCP on a
  // throttled phone, so fetch them when the block is nearly in view or is first
  // touched. Until then its form is a plain GET to /neighbour-prices/.
  var lookup = document.querySelector('.est-sell [data-jt-estimate]');
  if (lookup) {
    var lookupLoaded = false;
    var loadLookup = function () {
      if (lookupLoaded) return;
      lookupLoaded = true;
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/assets/block-estimate.css';
      document.head.appendChild(css);
      import('/assets/block-estimate.js').catch(function () { lookupLoaded = false; });
    };
    lookup.addEventListener('focusin', loadLookup);
    lookup.addEventListener('pointerdown', loadLookup);
    if ('IntersectionObserver' in window) {
      var lookupSeen = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { lookupSeen.disconnect(); loadLookup(); }
      }, { rootMargin: '400px 0px' });
      lookupSeen.observe(lookup);
    } else {
      loadLookup();
    }
  }

  var form = document.getElementById('estateLeadForm');
  if (!form) return;

  // The seller block's sold-price lookup (assets/block-estimate.js) fires
  // jte:valuation from its "Get Joe's valuation" button; on town pages that
  // means this form.
  document.addEventListener('jte:valuation', function () {
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var name = form.querySelector('input[name="name"]');
    if (name) setTimeout(function () { name.focus({ preventScroll: true }); }, 450);
  });

  var loadedAt = Date.now();
  var town = form.getAttribute('data-town') || '';
  var params = new URLSearchParams(window.location.search);

  function showError(message) {
    var box = form.querySelector('.est-form-err');
    if (!box) {
      box = document.createElement('p');
      box.className = 'est-form-err';
      box.setAttribute('role', 'alert');
      form.appendChild(box);
    }
    // Always leave a reachable way through: a failed POST must not be a dead end.
    box.innerHTML = '';
    box.appendChild(document.createTextNode(message + ' '));
    var link = document.createElement('a');
    link.href = 'https://wa.me/6581881488';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'WhatsApp Joe on +65 8188 1488';
    box.appendChild(link);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return; // double-submit guard
    // recaptcha-helper.js injects "website_url"; other pages carry an inline
    // "company_website". submit-lead.js checks both, so check both here too —
    // testing only one silently disables the client-side gate.
    var trapped = ['website_url', 'company_website'].some(function (n) {
      var el = form.querySelector('[name="' + n + '"]');
      return el && el.value;
    });
    if (trapped) return;

    // Must be >= submit-lead.js's time-on-form floor (currently 3000ms). The server
    // returns a silent HTTP 200 for anything under it — indistinguishable from a real
    // success — so with no client-side gate at all, a real visitor whose autofill
    // fills name+phone in well under a second gets shown "Got it" while the lead is
    // dropped. tests/estate-lead-form.test.mjs pins this against the server floor.
    if (Date.now() - loadedAt < 3000) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var originalLabel = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Sending…';

    var payload = {
      lead_type: 'valuation',
      full_name: form.elements.name.value.trim(),
      mobile_number: form.elements.phone.value.trim(),
      property_type: 'HDB',
      town: town,
      message: town ? 'Valuation request from the ' + town + ' HDB price page' : '',
      source_site: 'joetay.com',
      landing_page: window.location.pathname,
      submitted_at: new Date().toISOString(),
      time_on_form_ms: Date.now() - loadedAt,
    };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
      payload[k] = params.get(k) || '';
    });

    var tokenPromise = window.getRecaptchaToken
      ? window.getRecaptchaToken('estate_valuation')
      : Promise.resolve('');

    tokenPromise
      .then(function (token) {
        payload.recaptcha_token = token;
        return fetch('/.netlify/functions/submit-lead', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      })
      .then(function (res) {
        return res.json().catch(function () { return { ok: res.ok }; });
      })
      .then(function (result) {
        if (!result.ok) throw new Error(result.error || 'submit failed');
        var done = document.createElement('div');
        done.className = 'est-form-done';
        done.setAttribute('role', 'status');
        done.textContent = town
          ? 'Got it — I’ll come back to you with a considered ' + town + ' valuation within 24 hours.'
          : 'Got it — I’ll come back to you within 24 hours.';
        form.replaceWith(done);
        done.setAttribute('tabindex', '-1');
        done.focus();
        if (window.gtag) window.gtag('event', 'generate_lead', { lead_type: 'valuation', town: town });
      })
      .catch(function () {
        submit.disabled = false;
        submit.textContent = originalLabel;
        showError('Could not send that just now.');
      });
  });
})();
