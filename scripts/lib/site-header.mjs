// The one site header, used on every indexable page.
//
// Why: measured 2026-09-17, the site shipped nine header variants (site-nav,
// topbar with and without the injected jt-hn nav, nl-topbar, blog-topbar,
// calc-topbar, g-topbar, site-head, lp-topbar) with different links, CTA labels
// ("Sell with Joe", "Book a Call", "Free Valuation", "WhatsApp Joe"), heights and
// sticky behaviour. A visitor moving between pages saw a different site each
// time, and the theme toggle and mobile menu existed only where a template had
// remembered to load the shared assets. JOE-390 / JOE-391.
//
// The markup is self-contained: scoped `jt-sh-` class names and its own inline
// style block with pinned colours, so it cannot be broken by, and cannot break,
// the host page's stylesheet (same reasoning as lib/site-footer.mjs). Light is
// the default; the dark variant keys on `html.jt-theme-dark`, which
// assets/site-theme.js sets before first paint. assets/mobile-header.js turns
// the plain links into a burger menu at tablet widths and below, and
// assets/site-theme.js adds the theme toggle, so both assets are required — the
// apply script injects them.
//
// Ad landers (sell/, sell-hdb/, rent-out/) keep their own minimal header on
// purpose: paid traffic is not offered site-wide navigation.

export const SITE_HEADER_MARKER = 'data-jt-site-header';

export const HEADER_LINKS = [
  ['/valuation.html', 'Valuation'],
  ['/neighbour-prices/', 'Sold Prices'],
  ['/new-launches/', 'New Launches'],
  ['/insights/', 'Insights'],
  ['/calculator/', 'Calculators'],
  ['/about-joe/', 'About Joe'],
];

export const HEADER_CTA = [
  'https://wa.me/6581881488?text=Hi%20Joe%2C%20I%20found%20you%20on%20joetay.com%20and%20would%20like%20to%20ask%20about%20my%20property.',
  'WhatsApp Joe',
];

// Contrast, measured for tests/color-contrast.test.mjs:
//   light  #243653 on #faf6ec  = 11.6:1   links
//   dark   #d8e2f0 on #061430  = 13.4:1   links
//   CTA    #04231a on #10b981  =  7.9:1   both themes
const STYLE = `<style>
.jt-sh{position:sticky;top:0;z-index:100;background:rgba(250,246,236,.97);color:#0b1e3f;border-bottom:1px solid rgba(11,30,63,.12);box-shadow:0 2px 18px rgba(11,30,63,.08);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.jt-sh-inner{max-width:1180px;margin:0 auto;min-height:64px;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0}
.jt-sh-logo{display:inline-flex;align-items:baseline;gap:7px;color:inherit;text-decoration:none;white-space:nowrap}
.jt-sh .jt-mh-logo-name{font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:1.15rem;letter-spacing:-.5px;color:#0b1e3f}
.jt-sh .jt-mh-logo-brand{font-family:'DM Sans',Arial,sans-serif;font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(11,30,63,.82)}
.jt-sh-nav{display:flex;align-items:center;gap:22px;min-width:0}
.jt-sh-nav>a{color:#243653;font-family:'DM Sans',Arial,sans-serif;font-size:.88rem;font-weight:500;line-height:1;text-decoration:none;white-space:nowrap}
.jt-sh-nav>a:hover{color:#047857}
.jt-sh-nav>a[aria-current="page"]{color:#0b1e3f;font-weight:700}
.jt-sh-nav>a.jt-sh-cta{background:#10b981;color:#04231a;font-weight:700;padding:11px 16px;border-radius:999px;display:inline-flex;align-items:center;min-height:44px}
.jt-sh-nav>a.jt-sh-cta:hover{background:#34d399;color:#04231a}
.jt-sh a:focus-visible,.jt-sh button:focus-visible{outline:2px solid #047857;outline-offset:2px}
.jt-sh .jt-theme-toggle{border-color:rgba(11,30,63,.18);background:#fff;color:#0b1e3f}
.jt-sh .jt-mh-toggle{color:#0b1e3f}
html.jt-theme-dark .jt-sh{background:rgba(6,20,48,.96);color:#fff;border-bottom-color:rgba(255,255,255,.1);box-shadow:0 2px 20px rgba(0,0,0,.25)}
html.jt-theme-dark .jt-sh .jt-mh-logo-name{color:#fff}
html.jt-theme-dark .jt-sh .jt-mh-logo-brand{color:rgba(255,255,255,.88)}
html.jt-theme-dark .jt-sh-nav>a{color:#d8e2f0}
html.jt-theme-dark .jt-sh-nav>a:hover,html.jt-theme-dark .jt-sh-nav>a[aria-current="page"]{color:#fff}
html.jt-theme-dark .jt-sh a:focus-visible,html.jt-theme-dark .jt-sh button:focus-visible{outline-color:#10b981}
html.jt-theme-dark .jt-sh .jt-theme-toggle{border-color:rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff}
html.jt-theme-dark .jt-sh .jt-mh-toggle{color:#fff}
@media(max-width:1024px){
.jt-sh-inner{min-height:60px;padding:0 16px;gap:10px}
.jt-sh-nav>a.jt-sh-cta{padding:10px 14px}
}
@media(prefers-reduced-motion:no-preference){.jt-sh-nav>a{transition:color .2s}}
</style>`;

// Which link a page lives under, for aria-current. Exact match for the home
// link; prefix match for a section hub, so /insights/foo.html marks Insights.
export function currentSection(pagePath) {
  if (!pagePath || pagePath === '/') return null;
  for (const [href] of HEADER_LINKS) {
    if (href.endsWith('/') ? pagePath.startsWith(href) : pagePath === href) return href;
  }
  return null;
}

export function siteHeaderHtml({ pagePath = '' } = {}) {
  const current = currentSection(pagePath);
  const links = HEADER_LINKS.map(
    ([href, label]) => `      <a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('\n');
  return `<header class="jt-sh" ${SITE_HEADER_MARKER}>
  <div class="jt-sh-inner">
    <a href="/" class="jt-sh-logo"><span class="jt-mh-logo-name">Joe Tay</span><span class="jt-mh-logo-brand">PropertySG</span></a>
    <nav class="jt-sh-nav" aria-label="Primary">
${links}
      <a class="jt-sh-cta" href="${HEADER_CTA[0]}">${HEADER_CTA[1]}</a>
    </nav>
  </div>
${STYLE}
</header>`;
}

export const SITE_THEME_ASSETS_HTML = `<link rel="stylesheet" href="/assets/site-theme.css">
<script src="/assets/site-theme.js"></script>`;
