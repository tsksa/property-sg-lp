// JoeTay.com conversion tracking helpers
// Tracks lead form submissions, call taps, WhatsApp clicks, Calendly clicks, and Calendly bookings.
// Google Ads direct conversion IDs/labels can be filled in after creating conversions in Google Ads.
(function(){
  // Defensive gtag wrap: drop any conversion event whose send_to still contains
  // a PLACEHOLDER_ token. The inline onclick handlers across the site use
  // labels like AW-XXX/PLACEHOLDER_WHATSAPP that Google Ads silently rejects;
  // suppressing them avoids noisy invalid requests and confusing debug logs.
  // The moment real conversion labels are pasted in, the wrap becomes a no-op.
  if (typeof window.gtag === 'function') {
    var _gtagOriginal = window.gtag;
    window.gtag = function(){
      if (arguments[0] === 'event' && arguments[1] === 'conversion') {
        var params = arguments[2];
        if (params && typeof params.send_to === 'string' && params.send_to.indexOf('PLACEHOLDER_') !== -1) {
          return;
        }
      }
      return _gtagOriginal.apply(this, arguments);
    };
  }

  window.JT_TRACKING = window.JT_TRACKING || {
    googleAdsConversionId: '', // e.g. AW-123456789
    leadConversionLabel: '',   // e.g. AbCdEfGhIjkLmNoPqRs
    contactConversionLabel: '' // optional label for call/WhatsApp/Calendly clicks
  };

  function clean(obj){
    var out = {};
    Object.keys(obj || {}).forEach(function(k){
      var v = obj[k];
      if(v !== undefined && v !== null && v !== '') out[k] = v;
    });
    return out;
  }

  window.jtTrackConversion = function(eventName, params){
    var payload = clean(Object.assign({
      source_site: 'joetay.com',
      page_path: location.pathname,
      page_location: location.href
    }, params || {}));

    if(typeof window.gtag === 'function'){
      window.gtag('event', eventName, payload);

      var cfg = window.JT_TRACKING || {};
      var isLead = eventName === 'generate_lead';
      var isContact = eventName === 'contact_click';
      var label = isLead ? cfg.leadConversionLabel : (isContact ? cfg.contactConversionLabel : '');

      // Direct Google Ads conversion support. Leave disabled until AW ID + label are known.
      if(cfg.googleAdsConversionId && label){
        window.gtag('event', 'conversion', clean(Object.assign({}, payload, {
          send_to: cfg.googleAdsConversionId + '/' + label
        })));
      }
    }

    if(typeof window.fbq === 'function'){
      if(eventName === 'generate_lead'){
        window.fbq('track', 'Lead', clean({
          content_category: payload.lead_type || payload.intent || 'lead',
          content_name: payload.property_type || payload.contact_method || payload.lead_type || 'website_lead'
        }));
      }
      if(eventName === 'contact_click'){
        window.fbq('trackCustom', 'ContactClick', clean({
          contact_method: payload.contact_method,
          link_url: payload.link_url
        }));
      }
    }
  };

  function classifyLink(a){
    var href = a.getAttribute('href') || '';
    if(/^tel:/i.test(href)) return 'phone_call';
    if(/wa\.me|whatsapp/i.test(href)) return 'whatsapp';
    if(/calendly\.com/i.test(href)) return 'calendly';
    if(/^mailto:/i.test(href)) return 'email';
    return '';
  }

  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if(!a) return;
    var method = classifyLink(a);
    if(!method) return;
    window.jtTrackConversion('contact_click', {
      contact_method: method,
      link_url: a.href,
      link_text: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0,120)
    });
  }, true);

  window.addEventListener('message', function(e){
    var data = e.data || {};
    if(data.event === 'calendly.event_scheduled'){
      window.jtTrackConversion('generate_lead', {
        method: 'calendly',
        lead_type: 'calendly_booking'
      });
    }
  });
})();
