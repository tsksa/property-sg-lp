import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { consentBannerHtml, CONSENT_BANNER_MARKER } from '../scripts/lib/consent-banner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function allHtmlFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(ROOT, abs);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', '.github', 'scripts', 'ops', 'tests', '.claude'].includes(entry.name)) continue;
        walk(abs);
      } else if (entry.name.endsWith('.html')) {
        out.push(rel);
      }
    }
  })(ROOT);
  return out;
}

// This is the regression case for the bug the guard exists to catch: a
// visitor lands directly on any tracker-bearing page (organic result, Google
// Ad click, direct link — not the homepage) and GA4/Meta Pixel run with no
// consent prompt ever shown to them on that page.
test('every page that loads GA4/Meta Pixel offers a PDPA consent choice', () => {
  const missing = [];
  for (const rel of allHtmlFiles()) {
    const html = read(rel);
    if (!html.includes('ga-disable-GT-KVFDZD5V')) continue; // doesn't load trackers
    const hasSharedBanner = html.includes(CONSENT_BANNER_MARKER);
    // index.html carries a hand-authored equivalent instead of the shared block.
    const hasHomepageBanner = rel === 'index.html' && html.includes('id="cookieBanner"');
    if (!hasSharedBanner && !hasHomepageBanner) missing.push(rel);
  }
  assert.deepEqual(missing, [], `pages load trackers with no consent banner: ${missing.join(', ')}`);
});

test('the shared consent banner writes the same localStorage key the tracker gates read', () => {
  const block = consentBannerHtml();
  assert.match(block, /localStorage\.setItem\('pdpa_consent','declined'\)/);
  assert.match(block, /localStorage\.setItem\('pdpa_consent','accepted'\)/);

  // Sample a page that has the shared banner and confirm the head-of-page
  // tracker gate reads the exact same key — a mismatched key name would
  // silently break the whole contract.
  const sample = read('valuation.html');
  assert.match(sample, /localStorage\.getItem\('pdpa_consent'\)===['"]declined['"]/);
});

test('the shared consent banner disables GA and revokes Pixel consent on decline', () => {
  const block = consentBannerHtml();
  assert.match(block, /ga-disable-GT-KVFDZD5V['"]\]\s*=\s*true/);
  assert.match(block, /ga-disable-G-1YQE8JN66P['"]\]\s*=\s*true/);
  assert.match(block, /sessionStorage\.removeItem\('jt_lead_attribution_v1'\)/);
  assert.match(block, /fbq\('consent','revoke'\)/);
});

test('all tracker-bearing pages disable the verified GA4 measurement destination', () => {
  for (const rel of allHtmlFiles()) {
    const html = read(rel);
    if (!html.includes('ga-disable-GT-KVFDZD5V')) continue;
    assert.match(html, /ga-disable-G-1YQE8JN66P['"]\]\s*=\s*true/, `${rel} lacks measurement-ID opt-out`);
  }
});

test('sell/ and rent-out/ ad landers carry the consent banner too', () => {
  // These are excluded from the shared site footer (paid-traffic leak
  // concern) but they load the same trackers, so they must not be excluded
  // from consent — that would be the highest-exposure gap, not the lowest.
  for (const rel of ['sell/index.html', 'rent-out/index.html']) {
    const html = read(rel);
    assert.ok(html.includes('ga-disable-GT-KVFDZD5V'), `${rel} expected to load trackers`);
    assert.ok(html.includes(CONSENT_BANNER_MARKER), `${rel} is missing the PDPA consent banner`);
  }
});
