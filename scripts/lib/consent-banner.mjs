// A shared PDPA cookie-consent banner injected into every page that loads
// GA4 / Meta Pixel.
//
// Why: audited 2026-08-16 — the banner UI (the actual Accept/No-thanks
// prompt) only ever existed on index.html. Every other tracker-bearing page
// (73 total, including the two Google Ads landers sell/ and rent-out/) only
// carried the read-side check `if(pdpa_consent==='declined') don't load` —
// there was nothing that ever wrote that key on those pages, because nothing
// on them ever asked. A visitor who lands directly on an estate page, an
// insights article, or an ad lander (i.e. the entire organic and paid entry
// surface per ARCHITECTURE.md) was tracked by GA4/Pixel with zero consent
// UI ever shown to them. index.html itself already has a hand-authored
// version embedded in its monolithic stylesheet; it's deliberately left
// alone here (see apply-consent-banner.mjs EXCLUDED) rather than risking
// surgery on a 200KB page — this module targets everywhere else.
//
// Self-contained: scoped `jt-cb-` class names and its own inline style
// block, and literal colour values (not the page's `--emerald` custom
// properties, which aren't defined on every template) so it renders
// identically regardless of host page and can't be broken by one of them.

export const CONSENT_BANNER_MARKER = 'data-jt-consent-banner';

const STYLE = `<style>
.jt-cb{position:fixed;bottom:20px;left:50%;width:min(760px,calc(100% - 32px));transform:translateX(-50%);background:rgba(11,30,63,.96);color:#fff;padding:14px 16px 14px 20px;border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 14px 48px rgba(0,0,0,0.32);display:none;z-index:9999;gap:18px;align-items:center;font-size:0.8rem;line-height:1.45;backdrop-filter:blur(16px)}
.jt-cb.show{display:flex}
.jt-cb p{margin:0;flex:1;color:rgba(255,255,255,0.92)}
.jt-cb a{color:#10b981;text-decoration:underline}
.jt-cb-actions{display:flex;gap:8px;flex-shrink:0}
.jt-cb button{flex-shrink:0;background:#047857;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:0.85rem;cursor:pointer;white-space:nowrap;transition:background .2s}
.jt-cb button:hover{background:#065f46}
.jt-cb-decline{background:transparent!important;border:1px solid rgba(255,255,255,0.35)!important;font-weight:600;color:rgba(255,255,255,0.85)}
.jt-cb-decline:hover{border-color:rgba(255,255,255,0.6)}
@media(max-width:768px){.jt-cb{top:calc(72px + env(safe-area-inset-top));bottom:auto;left:12px;width:calc(100% - 24px);transform:none;flex-direction:column;align-items:stretch;text-align:left;padding:13px 14px;border-radius:12px;gap:10px;font-size:0.76rem;line-height:1.4}.jt-cb-actions{display:grid;grid-template-columns:1fr 1fr}.jt-cb button{width:100%;min-height:44px;padding:9px 12px;font-size:0.8rem}}
</style>`;

const SCRIPT = `<script>
(function initConsentBanner(){
  var banner=document.getElementById('jtConsentBanner');
  var accept=document.getElementById('jtConsentAccept');
  var decline=document.getElementById('jtConsentDecline');
  if(!banner||!accept) return;
  try{if(localStorage.getItem('pdpa_consent')) return;}catch(e){}
  setTimeout(function(){banner.classList.add('show');},1200);
  accept.addEventListener('click',function(){
    try{localStorage.setItem('pdpa_consent','accepted');}catch(e){}
    banner.classList.remove('show');
  });
  if(decline) decline.addEventListener('click',function(){
    try{localStorage.setItem('pdpa_consent','declined');}catch(e){}
    // Opt out immediately on this page load too, not just future ones — the
    // head snippet only checks the stored flag on the NEXT navigation.
    window['ga-disable-GT-KVFDZD5V']=true;
    window['ga-disable-G-1YQE8JN66P']=true;
    try{sessionStorage.removeItem('jt_lead_attribution_v1');}catch(e){}
    try{if(typeof fbq==='function')fbq('consent','revoke');}catch(e){}
    banner.classList.remove('show');
  });
})();
</script>`;

/** The block injected before </body> on each tracker-bearing page. Stable output — it is diffed. */
export function consentBannerHtml() {
  return `<div class="jt-cb" ${CONSENT_BANNER_MARKER} id="jtConsentBanner" role="region" aria-labelledby="jtConsentBannerHeading">
  <p><strong id="jtConsentBannerHeading">Cookie notice</strong> — This site uses cookies for basic analytics and to remember preferences. By continuing to browse, you agree to my <a href="/privacy-policy.html">Privacy Policy</a>.</p>
  <div class="jt-cb-actions">
    <button type="button" class="jt-cb-decline" id="jtConsentDecline" aria-label="No thanks — decline non-essential cookies">No thanks</button>
    <button type="button" id="jtConsentAccept" aria-label="Accept cookies">Accept</button>
  </div>
</div>
${STYLE}
${SCRIPT}`;
}
