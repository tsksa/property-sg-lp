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
  var fallbackDelay = 6000;
  var loaded = false;
  var fallbackTimer = null;
  var interactionEvents = ['pointerdown', 'keydown', 'touchstart'];

  function consentAccepted(){
    try{return localStorage.getItem(consentKey) === 'accepted';}catch(e){return false;}
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};

  function ensureMetaQueue(){
    if(window.fbq) return;
    var fbq = window.fbq = function(){
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

    ensureMetaQueue();
    window.fbq('consent', 'grant');
    window.fbq('init', metaPixelId);
    window.fbq('track', 'PageView');
    injectScript('jt-meta-pixel', 'https://connect.facebook.net/en_US/fbevents.js');
    return true;
  }

  function scheduleFallback(){
    if(!consentAccepted() || loaded || fallbackTimer !== null) return;
    fallbackTimer = setTimeout(loadVendors, fallbackDelay);
  }

  function scheduleAcceptedVisitor(){
    if(!consentAccepted() || loaded) return;
    ensureMetaQueue();
    interactionEvents.forEach(function(eventName){
      document.addEventListener(eventName, loadVendors, true);
    });
    if(document.readyState === 'complete') scheduleFallback();
    else window.addEventListener('load', scheduleFallback, {once:true});
  }

  // The banner's target handler stores the choice before this bubble listener
  // runs, so acceptance loads the vendors on that same page without a reload.
  document.addEventListener('click', function(event){
    if(!event.target.closest) return;
    if(event.target.closest('#cookieAccept, #jtConsentAccept')) loadVendors();
  });

  window.jtLoadAnalytics = loadVendors;
  scheduleAcceptedVisitor();
})();
