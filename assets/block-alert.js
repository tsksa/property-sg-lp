// Block sale alerts (JOE-403, UI audit step 6).
//
// One card, offered wherever a visitor has just looked up a block: the estimate
// widget's result (homepage hero and /valuation.html) and /neighbour-prices/.
// It posts to the existing /api/subscribe-alert function, which stores the
// subscription for the monthly alert-digest. The digest goes to JOE, who
// follows up personally — nothing is ever sent to the subscriber automatically,
// so the stored contact is seen by one person. Keep it that way.
//
// Usage: window.jtBlockAlert.mount(container, { postal_code, block, street_name, town })
// Mounting again on the same container replaces the card, so a new lookup
// resets a card the visitor did not submit.
(function () {
  'use strict';
  var ENDPOINT = '/api/subscribe-alert';
  var SUBMIT_LABEL = 'Alert me on the next sale →';

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') throw new Error('block-alert: markup is built as nodes, never from strings');
      else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (kid) { node.append(kid); });
    return node;
  }

  function track(name, params) {
    // Never send the name or contact: the funnel only needs the step.
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  }

  function mount(container, ctx, opts) {
    if (!container) return null;
    var c = ctx || {};
    var o = opts || {};
    var idBase = 'jtba-' + (container.id || Math.random().toString(36).slice(2, 8));
    container.textContent = '';

    var err = el('p', { class: 'jt-ba-err', role: 'alert', id: idBase + '-err' });
    var name = el('input', { type: 'text', id: idBase + '-name', name: 'name', placeholder: 'Your name', autocomplete: 'name', required: 'required' });
    var contact = el('input', { type: 'text', id: idBase + '-contact', name: 'contact', placeholder: 'Mobile or email', autocomplete: 'tel', required: 'required' });
    var consent = el('input', { type: 'checkbox', id: idBase + '-consent', required: 'required' });
    var honeypot = el('input', { type: 'text', name: 'company_website', tabindex: '-1', autocomplete: 'off' });
    var button = el('button', { type: 'submit', text: SUBMIT_LABEL });

    var form = el('form', { novalidate: 'novalidate', class: 'jt-ba-form' }, [
      el('div', { class: 'jt-ba-row' }, [
        el('label', { class: 'jt-ba-sr', for: idBase + '-name', text: 'Your name' }), name,
        el('label', { class: 'jt-ba-sr', for: idBase + '-contact', text: 'Mobile or email' }), contact,
      ]),
      el('label', { class: 'jt-ba-consent', for: idBase + '-consent' }, [
        consent,
        el('span', { text: 'I agree to be contacted by Joe Tay about resale activity for this block. One person sees this — no lists, no newsletters.' }),
      ]),
      el('div', { class: 'jt-ba-hp', 'aria-hidden': 'true' }, [honeypot]),
      button,
    ]);

    var where = c.block ? 'Blk ' + c.block : 'your block';
    var card = el('div', { class: 'jt-ba', 'data-jt-block-alert': '' }, [
      el('h3', { text: 'Know the moment your block moves' }),
      el('p', { text: 'When the next flat in ' + where + ' (or street) is registered as sold, I’ll message you the price personally — usually before it shows up on the portals.' }),
      err,
      form,
    ]);
    container.append(card);
    container.hidden = false;
    track('block_alert_view', { source: o.source || 'unknown' });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.classList.remove('show');
      if (!name.value.trim()) return fail('Please enter your name.');
      if (!contact.value.trim()) return fail('Please enter your mobile number or email.');
      if (!consent.checked) return fail('Please tick the consent box so Joe can contact you.');
      button.disabled = true;
      button.textContent = 'Setting up…';
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.value.trim(), contact: contact.value.trim(), consent: true,
          postal_code: c.postal_code || '', block: c.block || '',
          street_name: c.street_name || '', town: c.town || '',
          company_website: honeypot.value,
        }),
      }).then(function (r) {
        return r.json().catch(function () { return { ok: r.ok }; });
      }).then(function (r) {
        if (!r.ok) throw new Error(r.error || 'failed');
        card.textContent = '';
        card.append(el('h3', { text: 'You’re on the list.' }));
        card.append(el('p', { role: 'status', text: 'The moment the next sale in ' + where + ' is registered with HDB, Joe will message you the price. Usually once a month, and only when something actually sells.' }));
        track('block_alert_subscribe', { source: o.source || 'unknown' });
      }).catch(function (ex) {
        button.disabled = false;
        button.textContent = SUBMIT_LABEL;
        fail(ex.message === 'failed' ? 'Something went wrong — try again, or WhatsApp Joe directly.' : ex.message);
      });

      function fail(message) {
        err.textContent = message;
        err.classList.add('show');
        return false;
      }
    });

    return card;
  }

  window.jtBlockAlert = { mount: mount };
}());
