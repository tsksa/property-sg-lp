// Functional, one-use handoff. Never put the postal code in an analytics event,
// a valuation link, or persistent storage. Run before deferred analytics.
(function(){
  'use strict';
  const key = 'jt_written_valuation_postal';
  const lifetime = 60 * 1000;
  const isPostal = value => typeof value === 'string' && /^\d{6}$/.test(value);
  const url = new URL(location.href);
  const preset = url.searchParams.get('postal');
  if(preset !== null){
    url.searchParams.delete('postal');
    history.replaceState(history.state, '', url);
  }

  const lookup = document.getElementById('npForm');
  if(lookup){
    window.jtBindWrittenValuation = function(link, postal){
      // Rebinding replaces the previous result, even if the input has since changed.
      link.onclick = function(event){
        if(!isPostal(postal) || event.defaultPrevented || event.button !== 0 ||
           event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        try{
          sessionStorage.setItem(key, JSON.stringify({postal, expiresAt:Date.now() + lifetime}));
        }catch{ /* A plain link still works when storage is blocked. */ }
      };
    };
    if(isPostal(preset)){
      document.addEventListener('DOMContentLoaded', function(){
        document.getElementById('npPostal').value = preset;
        lookup.requestSubmit();
      }, {once:true});
    }
    return;
  }

  const input = document.getElementById('postalCode');
  if(!input) return;
  let postal = preset;
  try{
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if(preset === null && raw && location.hash === '#valForm'){
      const saved = JSON.parse(raw);
      const now = Date.now();
      if(saved && Number.isFinite(saved.expiresAt) && saved.expiresAt > now &&
         saved.expiresAt <= now + lifetime) postal = saved.postal;
    }
  }catch{ /* Nothing to prefill. */ }
  if(isPostal(postal) && !input.value){
    input.value = postal;
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }
})();
