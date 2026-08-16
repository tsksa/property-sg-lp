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
