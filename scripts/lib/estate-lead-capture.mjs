// Lead-capture block for the /hdb-prices/<town>/ estate pages.
//
// These pages rank for the highest-intent queries on the site ("<town> hdb
// resale price") and had no form and no WhatsApp link — only two anchors to
// other pages, so a seller had to click twice before they could reach anyone.
// The submit handler lives in /js/estate-lead.js so it is not duplicated 26
// times; the honeypot is injected by /js/recaptcha-helper.js.

export const LEAD_CAPTURE_CSS = `
.est-lead{margin-top:14px;display:grid;gap:10px;max-width:520px}
.est-lead-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:600px){.est-lead-row{grid-template-columns:1fr}}
.est-lead input{width:100%;padding:12px 14px;border-radius:10px;border:1.5px solid rgba(11,30,63,0.18);font-family:inherit;font-size:16px;background:#fff;color:#111}
.est-lead input:focus-visible{outline:2px solid var(--emerald);outline-offset:1px;border-color:var(--emerald)}
.est-lead button{padding:13px 20px;border:0;border-radius:10px;background:var(--emerald-dark);color:#fff;font-family:inherit;font-weight:700;font-size:0.95rem;cursor:pointer}
.est-lead button:hover{background:var(--navy)}
.est-lead button:disabled{opacity:.65;cursor:default}
.est-lead-note{font-size:0.8rem;color:#5a6473;margin:0}
.est-form-err{margin:0;font-size:0.86rem;color:#b42318}
.est-form-err a{color:#b42318;font-weight:600;text-decoration:underline}
.est-form-done{margin-top:14px;padding:14px 16px;border-radius:10px;background:rgba(16,185,129,0.10);border:1px solid rgba(16,185,129,0.35);font-weight:600;color:var(--navy)}
.est-wa{display:inline-flex;align-items:center;gap:8px;margin-top:4px;font-weight:600;color:var(--emerald-dark)}
`;

/**
 * The form + WhatsApp fallback for one town page.
 * @param {string} town  display name, e.g. "Tampines"
 * @param {(v: unknown) => string} esc
 */
export function leadCaptureHtml(town, esc) {
  const t = esc(town);
  const wa = encodeURIComponent(`Hi Joe, what's my flat in ${town} worth right now?`);
  return `  <form id="estateLeadForm" class="est-lead" data-town="${t}" novalidate>
    <p class="est-lead-note">Tell me your block and I'll price it against the actual ${t} sales above — not a town-wide median.</p>
    <div class="est-lead-row">
      <input type="text" name="name" placeholder="Your name" autocomplete="name" required aria-label="Your name">
      <input type="tel" name="phone" placeholder="e.g. 9123 4567" autocomplete="tel" required pattern="^(\\+65[\\s\\-]?)?[689]\\d{3}[\\s\\-]?\\d{4}$" title="Singapore mobile number" aria-label="Your mobile number">
    </div>
    <button type="submit">Get my ${t} valuation →</button>
    <p class="est-lead-note">Free, no obligation — the reply comes from me, not an auto-responder.</p>
    <noscript><p class="est-lead-note">JavaScript is off — <a href="https://wa.me/6581881488?text=${wa}">WhatsApp Joe on +65 8188 1488</a> instead.</p></noscript>
  </form>
  <a class="est-wa" href="https://wa.me/6581881488?text=${wa}" target="_blank" rel="noopener" data-cta="whatsapp-estate" onclick="if(typeof gtag==='function')gtag('event','whatsapp_cta_click',{cta_location:'estate-page',town:'${t}'});">Or WhatsApp me directly →</a>`;
}
