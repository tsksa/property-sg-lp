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

  var form = document.getElementById('estateLeadForm');
  if (!form) return;

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
