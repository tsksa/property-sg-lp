// A shared header navigation block for the bare `topbar` page template.
//
// Why: measured 2026-08-15, the 27 /hdb-prices/ pages carried a header with a
// logo and a single "← Back to home" link. That cluster is the site's highest
// organic-intent surface — someone reading their own town's resale median is a
// seller — but the page's only conversion paths (the lead form and the WhatsApp
// link) sit at the very bottom, after the medians, the flat-type tables, the
// nearby-town links and the FAQ. A reader had to scroll the entire page before
// anything asked for the lead.
//
// The other clusters already solved this: calc-topbar and nl-topbar both carry
// [logo] + [nav … CTA]. This block gives the topbar template the same shape, so
// the conversion path is above the fold, and closes one of the 8 header variants
// ARCHITECTURE.md flags as drift.
//
// It replaces the "← Back to home" link rather than sitting beside it: the nav's
// own "Home" entry covers that destination, and the logo already links home too.
//
// The markup is self-contained — scoped `jt-hn-` class names and its own inline
// style block — so it cannot be broken by, and cannot break, the host page's
// stylesheet. Same reasoning as lib/site-footer.mjs.

export const HEADER_NAV_MARKER = 'data-jt-header-nav';

const LINKS = [
  ['/', 'Home'],
  ['/hdb-prices/', 'HDB Prices'],
  ['/insights/', 'Insights'],
];

const CTA = ['/valuation.html', 'Free Valuation'];

// Colours are pinned literals, not var() references: this block is injected into
// pages whose custom properties are defined in their own inline stylesheets, and
// a var() that resolves to nothing would silently render invisible text.
// #d8e2f0 on the #0b1e3f→#061430 navy gradient and #04231a on #10b981 both clear
// WCAG AA; tests/color-contrast.test.mjs asserts it so it cannot drift.
const STYLE = `<style>
.jt-hn{display:flex;align-items:center;gap:18px;flex-wrap:wrap;justify-content:flex-end;min-width:0}
.jt-hn a{color:#d8e2f0;font-size:.88rem;font-weight:500;text-decoration:none;white-space:nowrap}
.jt-hn a:hover{color:#fff;text-decoration:underline}
.jt-hn a.jt-hn-cta{background:#10b981;color:#04231a;font-weight:700;padding:10px 16px;border-radius:8px;display:inline-flex;align-items:center}
.jt-hn a.jt-hn-cta:hover{background:#34d399;color:#04231a;text-decoration:none}
/* On phones the plain links are dropped and only the CTA is kept, so the header
   stays a single row instead of wrapping under the logo. Nothing is lost: the
   logo already links home, and the breadcrumb trail immediately below the header
   carries both "Home" and "HDB Prices by Town". WCAG 2.5.5: the CTA keeps a full
   44px touch height. */
@media(max-width:600px){
.jt-hn{gap:14px}
.jt-hn a:not(.jt-hn-cta){display:none}
.jt-hn a.jt-hn-cta{min-height:44px;padding:10px 15px}
}
</style>`;

// `cta` overrides the default "Free Valuation" link — needed on valuation.html
// itself, where a CTA pointing at /valuation.html would send the reader to the
// page they're already on.
export function headerNavHtml({ cta = CTA } = {}) {
  const links = LINKS.map(([href, label]) => `      <a href="${href}">${label}</a>`).join('\n');
  return `<nav class="jt-hn" ${HEADER_NAV_MARKER} aria-label="Primary">
${links}
      <a class="jt-hn-cta" href="${cta[0]}">${cta[1]}</a>
    </nav>${STYLE}`;
}
