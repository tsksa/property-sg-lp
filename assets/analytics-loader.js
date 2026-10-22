// Consent-aware, interaction-first loader for joetay.com's analytics vendors.
// Queue functions are available immediately, while the large third-party
// scripts stay off the rendering path until an accepted visitor interacts or
// the post-load fallback expires.
(function(){
  'use strict';

  var consentKey = 'pdpa_consent';
  var googleTagId = 'GT-KVFDZD5V';
  var measurementId = 'G-1YQE8JN66P';
  var metaPixelId = '3279494272146114';
  var loadMeta = !document.currentScript || document.currentScript.dataset.meta !== 'false';
  var fallbackDelay = 6000;
  var loaded = false;
  var fallbackTimer = null;
  var interactionEvents = ['pointerdown', 'keydown', 'touchstart'];

  // The in-memory choice also covers browsers that block localStorage. It
  // lasts only for this document; a new visit must ask again if it cannot save.
  var choice = window._jtConsentChoice;
  if(choice !== 'accepted' && choice !== 'declined'){
    try{choice = localStorage.getItem(consentKey);}catch(e){choice = null;}
  }
  function consentAccepted(){return choice === 'accepted';}
  window.jtGetAnalyticsConsent = function(){return choice;};

  window.dataLayer = window.dataLayer || [];
  var googleQueue = window.gtag || function(){window.dataLayer.push(arguments);};
  window.gtag = function(){
    // Do not replay events collected before opt-in or after withdrawal.
    if(!consentAccepted() && arguments[0] !== 'consent') return;
    return googleQueue.apply(this, arguments);
  };

  function ensureMetaQueue(){
    if(window.fbq) return;
    var fbq = window.fbq = function(){
      if(!consentAccepted() && arguments[0] !== 'consent') return;
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    if(!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = false;
    fbq.version = '2.0';
    fbq.queue = [];
  }

  function injectScript(id, src){
    if(document.getElementById(id)) return;
    var script = document.createElement('script');
    script.id = id;
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  function removeInteractionTriggers(){
    interactionEvents.forEach(function(eventName){
      document.removeEventListener(eventName, loadVendors, true);
    });
    if(fallbackTimer !== null){
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function updateVendorConsent(accepted){
    window['ga-disable-' + googleTagId] = !accepted;
    window['ga-disable-' + measurementId] = !accepted;
    if(!loaded) return;
    window.gtag('consent', 'update', {
      analytics_storage: accepted ? 'granted' : 'denied',
      ad_storage: accepted ? 'granted' : 'denied',
      ad_user_data: accepted ? 'granted' : 'denied',
      ad_personalization: accepted ? 'granted' : 'denied'
    });
    if(loadMeta && window.fbq) window.fbq('consent', accepted ? 'grant' : 'revoke');
  }

  window.jtSetAnalyticsConsent = function(value){
    if(value !== 'accepted' && value !== 'declined') return;
    var changed = choice !== value;
    choice = window._jtConsentChoice = value;
    try{localStorage.setItem(consentKey, value);}catch(e){}
    if(value === 'declined'){
      removeInteractionTriggers();
      try{sessionStorage.removeItem('jt_lead_attribution_v1');}catch(e){}
    }
    if(changed) updateVendorConsent(value === 'accepted');
    if(value === 'accepted') loadVendors();
  };

  // Another open page can withdraw consent while this page is still active.
  window.addEventListener('storage', function(event){
    if(event.key !== consentKey && event.key !== null) return;
    var value = event.key === consentKey ? event.newValue : null;
    choice = window._jtConsentChoice = value === 'accepted' ? 'accepted' : 'declined';
    if(consentAccepted()) scheduleAcceptedVisitor();
    else {
      removeInteractionTriggers();
      try{sessionStorage.removeItem('jt_lead_attribution_v1');}catch(e){}
    }
    updateVendorConsent(consentAccepted());
  });

  function loadVendors(){
    if(loaded || !consentAccepted()) return false;
    loaded = true;
    removeInteractionTriggers();

    window['ga-disable-' + googleTagId] = false;
    window['ga-disable-' + measurementId] = false;
    window.gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted'
    });
    window.gtag('js', new Date());
    window.gtag('config', googleTagId, {send_page_view:true});
    injectScript('jt-google-tag', 'https://www.googletagmanager.com/gtag/js?id=' + googleTagId);

    if(loadMeta){
      ensureMetaQueue();
      window.fbq('consent', 'grant');
      window.fbq('init', metaPixelId);
      window.fbq('track', 'PageView');
      injectScript('jt-meta-pixel', 'https://connect.facebook.net/en_US/fbevents.js');
    }
    return true;
  }

  function scheduleFallback(){
    if(!consentAccepted() || loaded || fallbackTimer !== null) return;
    fallbackTimer = setTimeout(loadVendors, fallbackDelay);
  }

  function scheduleAcceptedVisitor(){
    if(!consentAccepted() || loaded) return;
    if(loadMeta) ensureMetaQueue();
    interactionEvents.forEach(function(eventName){
      document.addEventListener(eventName, loadVendors, true);
    });
    if(document.readyState === 'complete') scheduleFallback();
    else window.addEventListener('load', scheduleFallback, {once:true});
  }

  // Support both banner IDs, including a click before this deferred file loads.
  document.addEventListener('click', function(event){
    if(!event.target.closest) return;
    if(event.target.closest('#cookieAccept, #jtConsentAccept')) window.jtSetAnalyticsConsent('accepted');
    if(event.target.closest('#cookieDecline, #jtConsentDecline')) window.jtSetAnalyticsConsent('declined');
  });

  window.jtLoadAnalytics = loadVendors;
  scheduleAcceptedVisitor();
})();
