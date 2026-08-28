// JoeTay.com conversion tracking helpers
// Tracks lead form submissions, call taps, WhatsApp clicks, Calendly clicks, and Calendly bookings.
// Google Ads direct conversion IDs/labels can be filled in after creating conversions in Google Ads.
(function(){
  var attributionKey = 'jt_lead_attribution_v1';
  var attributionLifetime = 30 * 60 * 1000;
  var campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  function consentChoice(){
    try{return localStorage.getItem('pdpa_consent');}catch(e){return null;}
  }

  function declined(){
    return window._pdpaDeclined === true || window['ga-disable-GT-KVFDZD5V'] === true ||
      window['ga-disable-G-1YQE8JN66P'] === true || consentChoice() === 'declined';
  }

  function clearAttribution(){
    try{sessionStorage.removeItem(attributionKey);}catch(e){}
  }

  function safeCampaign(source){
    var result = {};
    campaignKeys.forEach(function(key){
      var value = source && source[key];
      // Campaign labels only: never persist arbitrary URLs, email addresses,
      // free-text form values, or an entire query string.
      if(typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,120}$/.test(value)) result[key] = value;
    });
    return result;
  }

  function safePath(value){
    return typeof value === 'string' && /^\/[a-zA-Z0-9/_.-]*$/.test(value) && value.length <= 300 ? value : '/';
  }

  var params = new URLSearchParams(location.search);
  var currentCampaign = {};
  campaignKeys.forEach(function(key){currentCampaign[key] = params.get(key);});
  currentCampaign = safeCampaign(currentCampaign);

  function savedAttribution(){
    try{
      var saved = JSON.parse(sessionStorage.getItem(attributionKey));
      if(saved && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now() &&
        saved.expiresAt <= Date.now() + attributionLifetime){
        return Object.assign({landing_page:safePath(saved.landing_page)}, safeCampaign(saved));
      }
    }catch(e){}
    clearAttribution();
    return null;
  }

  function captureAttribution(accepted){
    if(!accepted || declined()) return;
    // A tagged arrival replaces the whole campaign, never mixing old/new UTMs.
    // Untagged internal navigation preserves the original entry path.
    if(!Object.keys(currentCampaign).length && savedAttribution()) return;
    try{
      sessionStorage.setItem(attributionKey, JSON.stringify(Object.assign({
        landing_page:safePath(location.pathname), expiresAt:Date.now() + attributionLifetime
      }, currentCampaign)));
    }catch(e){}
  }

  if(declined()) window['ga-disable-G-1YQE8JN66P'] = true;
  if(consentChoice() === 'accepted') captureAttribution(true);
  else clearAttribution();

  window.jtGetLeadAttribution = function(){
    if(declined()) {clearAttribution(); return {};}
    if(consentChoice() === 'accepted'){
      var saved = savedAttribution();
      if(saved) return saved;
    }
    // No persistence before acceptance; current-page tags remain available.
    return Object.assign({landing_page:safePath(location.pathname)}, currentCampaign);
  };

  document.addEventListener('click', function(e){
    if(!e.target.closest) return;
    if(e.target.closest('#cookieDecline, #jtConsentDecline')){
      window['ga-disable-G-1YQE8JN66P'] = true;
      clearAttribution();
    }else if(e.target.closest('#cookieAccept, #jtConsentAccept')){
      captureAttribution(true);
    }
  }, true);

  // Defensive gtag wrap: drop any conversion event whose send_to still contains
  // a PLACEHOLDER_ token. The inline onclick handlers across the site use
  // labels like AW-XXX/PLACEHOLDER_WHATSAPP that Google Ads silently rejects;
  // suppressing them avoids noisy invalid requests and confusing debug logs.
  // The moment real conversion labels are pasted in, the wrap becomes a no-op.
  if (typeof window.gtag === 'function') {
    var _gtagOriginal = window.gtag;
    window.gtag = function(){
      if(arguments[0] === 'event' && declined()) return;
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
    if(declined()) {clearAttribution(); return;}
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

  window.jtShowFormRecovery = function(form, options){
    if(!form || typeof form.querySelector !== 'function') return null;
    options = options || {};

    var submit = options.submit || form.querySelector('button[type="submit"]');
    var banner = form.querySelector('[data-jt-form-recovery]');
    if(!banner){
      banner = document.createElement('div');
      banner.className = 'jt-form-recovery';
      banner.setAttribute('data-jt-form-recovery', '');
      banner.setAttribute('role', 'alert');
      banner.setAttribute('tabindex', '-1');
      if(submit && submit.parentNode) submit.parentNode.insertBefore(banner, submit.nextSibling);
      else form.appendChild(banner);
    }

    banner.textContent = '';
    banner.style.cssText = 'margin-top:12px;padding:11px 13px;border:1px solid rgba(185,28,28,.3);border-radius:8px;background:rgba(254,226,226,.72);color:#991b1b;font-size:.86rem;line-height:1.5;';
    banner.appendChild(document.createTextNode(
      (options.message || 'We could not send this enquiry just now. Your details are still here.') + ' '
    ));

    var retry = document.createElement('span');
    retry.textContent = 'Try again, or ';
    banner.appendChild(retry);

    var link = document.createElement('a');
    var whatsappText = options.whatsappText || 'Hi Joe, I tried to send an enquiry on joetay.com but it did not go through. Can you help?';
    link.href = 'https://wa.me/6581881488?text=' + encodeURIComponent(whatsappText);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'WhatsApp Joe directly';
    link.style.cssText = 'color:#991b1b;font-weight:700;text-decoration:underline;';
    link.setAttribute('data-cta-location', options.ctaLocation || 'form_recovery');
    if(options.leadType) link.setAttribute('data-lead-type', options.leadType);
    banner.appendChild(link);
    banner.appendChild(document.createTextNode('.'));

    try{banner.focus({preventScroll:true});}catch(e){banner.focus();}
    return banner;
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
      link_text: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0,120),
      cta_location: a.getAttribute('data-cta-location') || '',
      lead_type: a.getAttribute('data-lead-type') || ''
    });
  }, true);

  window.addEventListener('message', function(e){
    // Only trust messages from the real Calendly origin — any other iframe
    // (Matterport, YouTube, embedded ads) or injected script could otherwise
    // post a fake calendly.event_scheduled and inflate the Lead conversion count.
    if(e.origin !== 'https://calendly.com') return;
    var data = e.data || {};
    if(data.event === 'calendly.event_scheduled'){
      window.jtTrackConversion('generate_lead', {
        method: 'calendly',
        lead_type: 'calendly_booking'
      });
    }
  });
})();
