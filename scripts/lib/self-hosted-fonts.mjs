// Self-hosted web fonts, replacing the Google Fonts <link> group on every page.
//
// Why: the 7 Sep 2026 audit measured LCP at 2.9s on the calculator, and the
// critical path ran through two third-party origins (fonts.googleapis.com for
// the CSS, then fonts.gstatic.com for the files) before any text could paint
// in its final face. Serving the two latin variable files from /assets/fonts
// removes both connections, lets the browser preload the files immediately,
// and drops two hosts from the CSP.
//
// The files are the latin subsets Google serves for the widest axis ranges any
// page requested (DM Sans wght 300–700, Fraunces opsz 9–144 / wght 500–800),
// so no page loses a weight it used. Both families are SIL Open Font License.

export const FONT_FILES = {
  serif: '/assets/fonts/fraunces-latin.woff2',
  sans: '/assets/fonts/dm-sans-latin.woff2',
};

const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,' +
  'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

export const FONT_BLOCK_MARKER = 'data-jt-fonts';

/**
 * The <head> block: two font preloads and the @font-face rules inline, so the
 * files start downloading from the HTML itself with no stylesheet round trip.
 * `display` is 'swap' for content pages and 'optional' for the calculators,
 * which previously requested display=optional to avoid layout shift.
 */
export function fontLinksHtml({ display = 'swap' } = {}) {
  return `<link rel="preload" as="font" type="font/woff2" href="${FONT_FILES.serif}" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="${FONT_FILES.sans}" crossorigin>
<style ${FONT_BLOCK_MARKER}="${display}">@font-face{font-family:'Fraunces';font-style:normal;font-weight:500 800;font-display:${display};src:url(${FONT_FILES.serif}) format('woff2');unicode-range:${LATIN_RANGE}}@font-face{font-family:'DM Sans';font-style:normal;font-weight:300 700;font-display:${display};src:url(${FONT_FILES.sans}) format('woff2');unicode-range:${LATIN_RANGE}}</style>`;
}
