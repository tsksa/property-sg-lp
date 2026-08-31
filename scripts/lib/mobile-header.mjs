export const MOBILE_HEADER_MARKER = 'data-jt-mobile-header-assets';

export function mobileHeaderAssetsHtml() {
  return `<link rel="stylesheet" href="/assets/mobile-header.css" ${MOBILE_HEADER_MARKER}>
<script src="/assets/mobile-header.js" defer ${MOBILE_HEADER_MARKER}></script>`;
}
