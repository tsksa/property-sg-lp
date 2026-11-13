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
.est-lead button{padding:13px 20px;border:0;border-radius:10px;background:var(--emerald-aa);color:#fff;font-family:inherit;font-weight:700;font-size:0.95rem;cursor:pointer}
.est-lead button:hover{background:var(--navy)}
.est-lead button:disabled{opacity:.65;cursor:default}
.est-lead-note{font-size:0.8rem;color:#5a6473;margin:0}
.est-form-err{margin:0;font-size:0.86rem;color:#b42318}
.est-form-err a{color:#b42318;font-weight:600;text-decoration:underline}
.est-form-done{margin-top:14px;padding:14px 16px;border-radius:10px;background:rgba(16,185,129,0.10);border:1px solid rgba(16,185,129,0.35);font-weight:600;color:var(--navy)}
.est-wa{display:inline-flex;align-items:center;gap:8px;margin-top:4px;font-weight:600;color:var(--emerald-text)}
.cta .est-wa,.cta .est-lead-note a{color:#6ee7c1}
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

// Seller block (AUDIT.md S1, U6, C2). The town pages rank for price queries and
// were read by owners deciding whether to sell, but the only contact prompt sat
// under a dozen data sections. This block goes directly under the price card:
// it says what the median does and does not tell a seller, embeds the block
// sold-price lookup (assets/block-estimate.js, the same widget as the homepage
// and /valuation.html; /js/estate-lead.js loads it when the block nears view) and offers WhatsApp with the town already in the message.
//
// The lookup's "Get Joe's valuation" button dispatches `jte:valuation`; on these
// pages /js/estate-lead.js hands the visitor to the valuation form at the foot of
// the page. Keep this block lean: town pages are capped at 65KB
// (tests/estate-schema.test.mjs).
export const SELLER_BLOCK_CSS = `
.est-sell{margin:8px 0 34px;padding:24px 26px;background:#fff;border:1px solid rgba(11,30,63,0.1);border-radius:18px}
.est-sell>h2{margin:0 0 8px}
.est-sell>p{margin:0 0 16px;color:#34425a;max-width:62ch}
.est-sell .jte{padding-top:16px;border-top:1px solid rgba(11,30,63,0.1)}
.est-sell .jte-heading{font-size:1.1rem}
.est-sell-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;margin-top:18px}
.est-sell-wa{display:inline-flex;align-items:center;min-height:44px;padding:11px 18px;border-radius:10px;background:var(--emerald-aa);color:#fff;font-weight:700;text-decoration:none}
.est-sell-wa:hover{background:var(--navy);text-decoration:none}
.est-sell-alt{display:inline-flex;align-items:center;min-height:44px;font-weight:600}
html.jt-theme-dark .est-sell{background:#102447;border-color:rgba(255,255,255,.12)}
html.jt-theme-dark .est-sell>p{color:#c1cad8}
html.jt-theme-dark .est-sell .jte{border-top-color:rgba(255,255,255,.12)}
html.jt-theme-dark .est-sell-wa{background:#6ee7c1;color:#052e22}
@media(max-width:600px){.est-sell{padding:20px 18px}.est-sell-wa{width:100%;justify-content:center}}
`;

/**
 * @param {string} town  display name, e.g. "Tampines"
 * @param {(v: unknown) => string} esc
 */
export function sellerBlockHtml(town, esc) {
  const t = esc(town);
  const wa = encodeURIComponent(`Hi Joe, I'm thinking of selling my HDB flat in ${town}. What do the recent sales in my block say?`);
  return `  <section class="est-sell" aria-labelledby="est-sell-h">
    <h2 id="est-sell-h">Selling your HDB flat in ${t}?</h2>
    <p>The ${t} median is a starting point, not your price. A flat is priced from the sales in its own block and street, then adjusted for floor, remaining lease and condition. Start with your block.</p>
    <noscript><link rel="stylesheet" href="/assets/block-estimate.css"></noscript>
    <div class="jte" data-jt-estimate data-context="estate-page">
      <h3 class="jte-heading" id="est-sell-lookup-h">What did flats in your block sell for?</h3>
      <form class="jte-form" action="/neighbour-prices/" method="get" novalidate aria-labelledby="est-sell-lookup-h">
        <label class="jte-label" for="estSellPostal">Your postal code</label>
        <div class="jte-row">
          <input class="jte-input" id="estSellPostal" name="postal" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="postal-code" placeholder="e.g. 560123" required>
          <button type="submit" class="jte-go">Show sold prices</button>
        </div>
        <p class="jte-error" role="alert" hidden></p>
        <p class="jte-status" role="status" aria-live="polite"></p>
      </form>
      <section class="jte-result" hidden aria-label="Sold prices for your block"></section>
    </div>
    <div class="est-sell-actions">
      <a class="est-sell-wa" href="https://wa.me/6581881488?text=${wa}" target="_blank" rel="noopener" data-cta="whatsapp-estate-seller" onclick="if(typeof gtag==='function')gtag('event','whatsapp_cta_click',{cta_location:'estate-seller-block',town:'${t}'});">WhatsApp Joe about your ${t} flat</a>
      <a class="est-sell-alt" href="#estateLeadForm">Or leave your number for a valuation</a>
    </div>
  </section>`;
}
