// A shared footer navigation block injected into every indexable page.
//
// Why: measured 2026-08-15, 70 of 74 pages had three or fewer footer links, so
// most of the site had no navigation safety net at all. More importantly for
// search, internal links are the only authority lever available here, and it
// was badly distributed — /valuation.html, the primary conversion funnel, had
// just 9 inbound links while /insights/ had 38. The best-ranking page on the
// site (the commission article, position 26.5) is also the most-linked, at 28.
//
// The markup is self-contained: scoped `jt-sf-` class names and its own inline
// style block, so it renders identically on 8 different page templates without
// depending on any of their stylesheets, and cannot be broken by one of them.
//
// Excluded by design: sell/ and rent-out/ are Google Ads landers where outbound
// links leak paid traffic, and the noindex utility pages.

export const FOOTER_MARKER = 'data-jt-site-footer';

const LINK_GROUPS = [
  ['Find your number', [
    ['/valuation.html', 'Free valuation'],
    ['/neighbour-prices/', "Your block's sold prices"],
    ['/hdb-prices/', 'HDB prices by town'],
    ['/calculator/', 'Affordability calculator'],
    ['/stamp-duty-calculator/', 'Stamp duty calculator'],
  ]],
  ['Browse', [
    ['/new-launches/', 'New launches'],
    ['/insights/', 'Guides & insights'],
    ['/glossary/', 'Property glossary'],
  ]],
];

const STYLE = `<style>
.jt-sf{border-top:1px solid rgba(127,127,127,.22);margin-top:28px;padding-top:22px;text-align:left}
.jt-sf-cols{display:flex;flex-wrap:wrap;gap:28px 48px;max-width:1080px;margin:0 auto}
.jt-sf-col{min-width:180px}
/* No opacity here: at .62 these headings measured 2.61:1 in light mode and at
   .85 still only 4.12, both failing WCAG AA for small text. Uppercase, weight
   and letter-spacing carry the hierarchy instead. */
.jt-sf-col h2{font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;margin:0 0 10px;font-weight:700}
.jt-sf-col ul{list-style:none;margin:0;padding:0}
.jt-sf-col li{margin:0 0 8px}
.jt-sf-col a{font-size:.9rem;text-decoration:none;opacity:.96}
.jt-sf-col a:hover{text-decoration:underline;opacity:1}
.jt-sf-contact{max-width:1080px;margin:18px auto 0;font-size:.9rem}
.jt-sf-contact a{font-weight:600;text-decoration:none}
.jt-sf-contact a:hover{text-decoration:underline}
/* On touch, make each link a full 44px row. At the inherited 19px line height
   these were the same undersized footer targets the UI audit already flagged. */
@media(max-width:600px){
.jt-sf-cols{gap:14px 32px}
.jt-sf-col{min-width:140px}
.jt-sf-col li{margin:0}
.jt-sf-col a{display:block;padding:12px 0}
.jt-sf-contact a{display:inline-block;padding:12px 0}
}
</style>`;

/** The block injected into each page's <footer>. Stable output — it is diffed. */
export function siteFooterHtml() {
  const cols = LINK_GROUPS.map(
    ([heading, links]) => `    <div class="jt-sf-col">
      <h2>${heading}</h2>
      <ul>
${links.map(([href, label]) => `        <li><a href="${href}">${label}</a></li>`).join('\n')}
      </ul>
    </div>`,
  ).join('\n');

  return `<nav class="jt-sf" ${FOOTER_MARKER} aria-label="Site sections">
  <div class="jt-sf-cols">
${cols}
  </div>
  <p class="jt-sf-contact">Talk to Joe directly — <a href="https://wa.me/6581881488" target="_blank" rel="noopener">WhatsApp +65 8188 1488</a> · <a href="tel:+6581881488">call</a></p>
</nav>${STYLE}`;
}
