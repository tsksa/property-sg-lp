import assert from 'node:assert/strict';
import test from 'node:test';

import { siteFooterHtml } from '../scripts/lib/site-footer.mjs';

// Guards the shared site-footer's link list against a page shipping without
// getting site-wide internal-link equity from every other page — the exact
// gap /stamp-duty-calculator/ had: it launched, was linked from three pages,
// but was missing from the ~70-page shared footer everything else gets its
// authority from. This would have failed before that fix landed.

const html = siteFooterHtml();

test('the shared footer links every lead-generating tool page', () => {
  const expected = [
    '/valuation.html',
    '/neighbour-prices/',
    '/hdb-prices/',
    '/calculator/',
    '/stamp-duty-calculator/',
  ];
  for (const href of expected) {
    assert.match(html, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `footer missing link to ${href}`);
  }
});

test('the shared footer links every content/browse section', () => {
  const expected = ['/new-launches/', '/insights/', '/glossary/'];
  for (const href of expected) {
    assert.match(html, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `footer missing link to ${href}`);
  }
});

test('the shared footer supports pages already earning search impressions', () => {
  const expected = new Map([
    ['/new-launches/chuan-grove.html', 'Chuan Grove updates'],
    ['/calculator/', 'HDB loan calculator'],
    ['/insights/property-agent-commission-singapore.html', 'Property agent commission guide'],
    ['/new-launches/thomson-reserve.html', 'Thomson Reserve updates'],
    ['/new-launches/keppel-bay-plot-6.html', 'Keppel Bay Plot 6 updates'],
  ]);

  for (const [href, label] of expected) {
    assert.match(
      html,
      new RegExp(`<a href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">${label}</a>`),
      `footer missing search-priority link to ${href}`,
    );
  }
});
