// Inline "2026 Seller's Checklist" offer (audit C1).
//
// The checklist was offered only in the homepage exit popup, which phones
// rarely trigger. This fills every `[data-jt-checklist]` slot — on the seller
// guides and the HDB town pages — with the same offer: enter an email to open
// the checklist straight away, or ask Joe for it on WhatsApp.
//
// The email route sends the same payload as the homepage exit popup
// (newsletter_signup + lead_magnet), so the server treats it identically; only
// source_widget differs, for attribution. Built by script so the 26 town pages
// carry one empty slot each rather than the markup (they have a size budget).
(function () {
  'use strict';

  var slots = document.querySelectorAll('[data-jt-checklist]');
  if (!slots.length) return;

  var CHECKLIST_URL = '/downloads/seller-checklist-2026.html';
  var WHATSAPP_URL = 'https://wa.me/6581881488?text=' +
    encodeURIComponent("Hi Joe, please send me the 2026 Seller's Checklist.");
  var loadedAt = Date.now();

  // Contrast: #243653 on #fff = 11.9:1; #fff on #047857 = 5.5:1;
  // #047857 on #fff = 5.5:1; dark #d8e2f0 on #0b1e3f = 12.9:1;
  // dark #04231a on #10b981 = 7.9:1; dark #6ee7b7 on #0b1e3f = 11.2:1.
  var style = document.createElement('style');
  style.textContent =
    '.jt-cl{margin:40px 0 0;padding:24px;background:#fff;border:1px solid rgba(11,30,63,.14);border-left:4px solid #047857;border-radius:14px;color:#243653;font-family:"DM Sans",Arial,sans-serif;font-size:.95rem;line-height:1.55;text-align:left}' +
    '.jt-cl h3{margin:0 0 8px;font-family:"Fraunces",Georgia,serif;font-size:1.3rem;font-weight:600;line-height:1.25;color:#0b1e3f}' +
    '.jt-cl p{margin:0 0 14px;color:#243653}' +
    '.jt-cl-form{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px}' +
    '.jt-cl-form input[type=email]{flex:1 1 220px;min-width:0;min-height:48px;padding:0 14px;border:1.5px solid #8a94a6;border-radius:10px;font:inherit;color:#0b1e3f;background:#fff}' +
    '.jt-cl-form input[type=email]:focus{outline:2px solid #047857;outline-offset:1px;border-color:#047857}' +
    '.jt-cl-form button{flex:0 0 auto;min-height:48px;padding:0 20px;border:0;border-radius:10px;background:#047857;color:#fff;font:inherit;font-weight:700;cursor:pointer}' +
    '.jt-cl-form button:hover{background:#065f46}' +
    '.jt-cl-form button:disabled{opacity:.7;cursor:default}' +
    '.jt-cl-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}' +
    '.jt-cl a{color:#047857;font-weight:700;text-decoration:underline}' +
    '.jt-cl p.jt-cl-note{margin:0;font-size:.82rem;color:#4a5872}' +
    '.jt-cl p.jt-cl-note a{font-weight:500}' +
    '.jt-cl p.jt-cl-err{margin:0 0 12px;color:#b42318}' +
    '.jt-cl p.jt-cl-done{margin:0 0 12px;font-weight:700;color:#0b1e3f}' +
    '.jt-cl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
    'html.jt-theme-dark .jt-cl{background:#0b1e3f;border-color:rgba(255,255,255,.16);border-left-color:#10b981;color:#d8e2f0}' +
    'html.jt-theme-dark .jt-cl h3,html.jt-theme-dark .jt-cl p.jt-cl-done{color:#fff}' +
    'html.jt-theme-dark .jt-cl p,html.jt-theme-dark .jt-cl p.jt-cl-note{color:#d8e2f0}' +
    'html.jt-theme-dark .jt-cl a{color:#6ee7b7}' +
    'html.jt-theme-dark .jt-cl p.jt-cl-err{color:#fda29b}' +
    'html.jt-theme-dark .jt-cl-form input[type=email]{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.4);color:#fff}' +
    'html.jt-theme-dark .jt-cl-form button{background:#10b981;color:#04231a}' +
    '@media(max-width:560px){.jt-cl{padding:20px 18px}.jt-cl-form button{flex:1 1 100%}}';
  document.head.appendChild(style);

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === 'text') node.textContent = props[key];
      else if (key === 'className') node.className = props[key];
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function checklistLink(text) {
    return el('a', { href: CHECKLIST_URL, target: '_blank', rel: 'noopener', text: text });
  }

  function build(slot, index) {
    var titleId = 'jtClTitle' + index;
    var emailId = 'jtClEmail' + index;
    var email = el('input', {
      id: emailId, type: 'email', name: 'email', required: '', autocomplete: 'email',
      autocapitalize: 'off', placeholder: 'Email address',
    });
    var honeypot = el('input', {
      type: 'text', name: 'company_website', tabindex: '-1', autocomplete: 'off',
      'aria-hidden': 'true', className: 'jt-cl-hp',
    });
    var submit = el('button', { type: 'submit', text: 'Open the checklist' });
    var form = el('form', { className: 'jt-cl-form', novalidate: '' }, [
      el('label', { for: emailId, className: 'jt-cl-sr', text: 'Email address' }),
      email, honeypot, submit,
    ]);
    var whatsapp = el('a', {
      href: WHATSAPP_URL, target: '_blank', rel: 'noopener',
      'data-cta-location': 'inline_checklist', 'data-lead-type': 'seller_checklist',
      text: 'ask Joe for it on WhatsApp',
    });
    var alt = el('p', { className: 'jt-cl-note' }, [
      document.createTextNode('Prefer not to give an email? You can '),
      whatsapp,
      document.createTextNode('. The email option also adds one market update email per month (unsubscribe anytime). '),
      el('a', { href: '/privacy-policy.html', text: 'Privacy Policy' }),
      document.createTextNode('.'),
    ]);
    var box = el('aside', { className: 'jt-cl', 'aria-labelledby': titleId }, [
      el('h3', { id: titleId, text: 'Get the 2026 Seller’s Checklist' }),
      el('p', { text: 'One page covering every HDB document, fee and deadline: MOP check, CPF refund, OTP fees, online endorsement and resale completion. Current for the April 2026 HDB process.' }),
      form,
      alt,
    ]);
    slot.replaceWith(box);

    function showError(message) {
      var old = box.querySelector('.jt-cl-err');
      if (old) old.remove();
      // A failed send must not be a dead end: the WhatsApp route stays below.
      box.insertBefore(el('p', { className: 'jt-cl-err', role: 'alert', text: message }), alt);
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (submit.disabled) return; // double-submit guard
      if (honeypot.value) return;
      // Must be >= submit-lead.js's time-on-form floor (currently 3000ms): the
      // server answers a faster submit with a silent 200, which would read as
      // success here. tests/checklist-offer.test.mjs pins this to the server.
      if (Date.now() - loadedAt < 3000) return;
      var address = email.value.trim();
      if (!address || !email.checkValidity()) {
        email.setAttribute('aria-invalid', 'true');
        showError('Please enter a valid email address.');
        email.focus();
        return;
      }
      email.removeAttribute('aria-invalid');
      submit.disabled = true;
      submit.textContent = 'Sending…';

      var attribution = typeof window.jtGetLeadAttribution === 'function' ? window.jtGetLeadAttribution() : {};
      var payload = Object.assign({
        lead_type: 'newsletter_signup',
        source_widget: 'inline_checklist',
        lead_magnet: 'seller_checklist_2026',
        email_address: address,
        newsletter_opt_in: 1,
      }, attribution, {
        source_site: 'joetay.com',
        landing_page: window.location.pathname,
        submitted_at: new Date().toISOString(),
        time_on_form_ms: Date.now() - loadedAt,
      });

      fetch('/.netlify/functions/submit-lead', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (result) {
            if (!res.ok || !result || result.ok !== true) throw new Error('submit failed');
          });
        })
        .then(function () {
          var done = el('p', { className: 'jt-cl-done', role: 'status', tabindex: '-1' }, [
            document.createTextNode('Your checklist is ready. '),
            checklistLink('Open the 2026 Seller’s Checklist →'),
          ]);
          var stale = box.querySelector('.jt-cl-err');
          if (stale) stale.remove();
          form.replaceWith(done);
          done.focus();
          if (window.gtag) window.gtag('event', 'generate_lead', { lead_type: 'newsletter_signup', lead_magnet: 'seller_checklist_2026' });
        })
        .catch(function () {
          submit.disabled = false;
          submit.textContent = 'Open the checklist';
          showError('Could not send that just now. You can still ask for it on WhatsApp below.');
        });
    });
  }

  for (var i = 0; i < slots.length; i += 1) build(slots[i], i + 1);
})();
