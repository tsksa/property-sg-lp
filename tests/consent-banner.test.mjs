import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { consentBannerHtml, CONSENT_BANNER_MARKER } from '../scripts/lib/consent-banner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('consent copy discloses optional advertising and does not imply consent from browsing', () => {
  for (const html of [consentBannerHtml(), read('index.html')]) {
    assert.match(html, /Google\/Meta advertising, including personalization/);
    assert.match(html, /Browsing is not consent/);
    assert.doesNotMatch(html, /By continuing to browse, you agree/);
  }
  const policy = read('privacy-policy.html');
  assert.match(policy, /Meta Pixel/);
  assert.match(policy, /advertising user data and personalization/);
  assert.doesNotMatch(policy, /We do not run remarketing pixels/);
  assert.match(policy, /id="withdrawCookieConsent"/);
  assert.match(policy, /ad_personalization:'denied'/);
  assert.match(policy, /window\.location\.reload\(\)/);
});

test('privacy withdrawal persists decline, revokes vendors and reloads before further browsing', () => {
  const policy = read('privacy-policy.html');
  const script = policy.match(/<script>\s*(document\.getElementById\('withdrawCookieConsent'\)[\s\S]*?)<\/script>/)[1];
  let click;
  let reloaded = false;
  const storage = new Map([['pdpa_consent', 'accepted']]);
  const session = new Map([['jt_lead_attribution_v1', 'test-attribution']]);
  const calls = [];
  const window = { location: { reload() { reloaded = true; } } };
  vm.runInNewContext(script, {
    window,
    document: { getElementById() { return { addEventListener(type, fn) { assert.equal(type, 'click'); click = fn; } }; } },
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } },
    sessionStorage: { removeItem(key) { session.delete(key); } },
    gtag: (...args) => calls.push(args),
    fbq: (...args) => calls.push(args),
  });
  click();
  assert.equal(storage.get('pdpa_consent'), 'declined');
  assert.equal(session.has('jt_lead_attribution_v1'), false);
  assert.equal(window['ga-disable-G-1YQE8JN66P'], true);
  assert.equal(calls[0][2].ad_personalization, 'denied');
  assert.deepEqual(calls[1], ['consent', 'revoke']);
  assert.equal(reloaded, true);
});

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
    if (!html.includes('ga-disable-GT-KVFDZD5V') && !html.includes('/assets/analytics-loader.js')) continue; // doesn't load trackers
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

  // Sample a page that has the shared banner and confirm the shared loader
  // reads the exact same key — a mismatched key name would break the contract.
  const sample = read('valuation.html');
  const loader = read('assets/analytics-loader.js');
  assert.match(sample, /\/assets\/analytics-loader\.js/);
  assert.match(loader, /localStorage\.getItem\(consentKey\)/);
  assert.match(loader, /choice === 'accepted'/);
});

test('every tracker-bearing page uses the deferred loader with no inline vendor URLs or connection hints', () => {
  let count = 0;
  for (const rel of allHtmlFiles()) {
    const html = read(rel);
    if (!html.includes('pdpa_consent') && !html.includes('/assets/analytics-loader.js')) continue;
    count += 1;
    assert.equal((html.match(/src="\/assets\/analytics-loader\.js"/g) || []).length, 1, rel);
    assert.match(html, /\/assets\/analytics-loader\.js/, `${rel} should use the shared analytics loader`);
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js/, `${rel} embeds the Google vendor URL`);
    assert.doesNotMatch(html, /connect\.facebook\.net\/en_US\/fbevents\.js/, `${rel} embeds the Meta vendor URL`);
    assert.doesNotMatch(html, /facebook\.com\/tr[?]/, `${rel} sends a tracking pixel without a consent choice`);
    assert.doesNotMatch(html, /<link[^>]+rel="(?:preconnect|dns-prefetch)"[^>]+(?:googletagmanager|connect\.facebook)/, `${rel} connects to a vendor before consent`);
  }
  assert.equal(count, 127, 'all current direct-entry pages are covered');
});

test('calculator pages keep their existing Google-only analytics scope', () => {
  for (const rel of [
    'calculator/index.html',
    'bto-calculator/index.html',
    'stamp-duty-calculator/index.html',
  ]) {
    const html = read(rel);
    assert.match(html, /\/assets\/analytics-loader\.js[^>]+data-meta="false"/, `${rel} should not load Meta Pixel`);
  }
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
    if (!html.includes('ga-disable-GT-KVFDZD5V') &&
      !html.includes('/assets/analytics-loader.js')) continue;
    assert.match(html, /ga-disable-G-1YQE8JN66P['"]\]\s*=\s*true/, `${rel} lacks measurement-ID opt-out`);
  }
});

test('sell/, sell-hdb/singapore/ and rent-out/ ad landers carry the consent banner too', () => {
  // These are excluded from the shared site footer (paid-traffic leak
  // concern) but they load the same trackers, so they must not be excluded
  // from consent — that would be the highest-exposure gap, not the lowest.
  for (const rel of ['sell/index.html', 'sell-hdb/singapore/index.html', 'rent-out/index.html']) {
    const html = read(rel);
    const loadsTrackers = html.includes('gtag/js?id=GT-KVFDZD5V') ||
      html.includes('/assets/analytics-loader.js');
    assert.ok(loadsTrackers, `${rel} expected to load trackers`);
    assert.ok(html.includes(CONSENT_BANNER_MARKER), `${rel} is missing the PDPA consent banner`);
  }
});

// Execute each page's real banner and configured shared loader. Vendor script
// insertion is captured locally; this suite never downloads or contacts vendors.
function pageHarness(rel, { consent = null, blocked = false, blockedWrites = false, deferLoader = false } = {}) {
  const html = read(rel);
  const loaderTag = html.match(/<script[^>]*src="\/assets\/analytics-loader\.js"[^>]*>/)?.[0];
  assert.ok(loaderTag, `${rel}: missing loader`);
  const homepage = rel === 'index.html';
  const bannerId = homepage ? 'cookieBanner' : 'jtConsentBanner';
  const acceptId = homepage ? 'cookieAccept' : 'jtConsentAccept';
  const declineId = homepage ? 'cookieDecline' : 'jtConsentDecline';
  const bannerScript = homepage
    ? html.match(/\(function initCookieBanner\(\)\{[\s\S]*?\n\}\)\(\);/)[0]
    : html.match(/\(function initConsentBanner\(\)\{[\s\S]*?\n\}\)\(\);/)[0];
  const storage = new Map(consent ? [['pdpa_consent', consent]] : []);
  const session = new Map([['jt_lead_attribution_v1', 'old-attribution']]);
  const nodes = new Map();
  const scripts = [];
  const documentListeners = new Map();
  const windowListeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let reloaded = false;
  for (const id of [bannerId, acceptId, declineId, 'withdrawCookieConsent']) {
    const classes = new Set();
    nodes.set(id, {
      id, listeners: new Map(),
      classList: { add(c) { classes.add(c); }, remove(c) { classes.delete(c); }, contains(c) { return classes.has(c); } },
      addEventListener(type, callback) { this.listeners.set(type, callback); },
      closest(selector) { return selector.split(', ').includes(`#${id}`) ? this : null; },
    });
  }
  const on = (map, type, fn) => { const set = map.get(type) || new Set(); set.add(fn); map.set(type, set); };
  const document = {
    readyState: 'complete', currentScript: { dataset: { meta: loaderTag.includes('data-meta="false"') ? 'false' : 'true' } },
    getElementById(id) { return nodes.get(id) || scripts.find(node => node.id === id); },
    createElement(tagName) { return { tagName: tagName.toUpperCase() }; },
    head: { appendChild(node) { scripts.push(node); } },
    addEventListener(type, callback) { on(documentListeners, type, callback); },
    removeEventListener(type, callback) { documentListeners.get(type)?.delete(callback); },
  };
  const context = vm.createContext({
    document, Date,
    localStorage: {
      getItem(k) { if (blocked) throw Error('blocked'); return storage.get(k) ?? null; },
      setItem(k, v) { if (blocked || blockedWrites) throw Error('blocked'); storage.set(k, v); },
    },
    sessionStorage: { removeItem(k) { session.delete(k); } },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, callback) { on(windowListeners, type, callback); },
    location: { reload() { reloaded = true; } },
  });
  context.window = context;
  vm.runInContext(bannerScript, context);
  const load = () => vm.runInContext(read('assets/analytics-loader.js'), context);
  if (!deferLoader) load();
  return {
    context, scripts, storage, session, acceptId, declineId, load,
    get shown() { return nodes.get(bannerId).classList.contains('show'); },
    get reloaded() { return reloaded; },
    runTimers() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    click(id) {
      const target = nodes.get(id);
      target.listeners.get('click')?.();
      for (const fn of [...(documentListeners.get('click') || [])]) fn({ target });
    },
    interact() { for (const fn of [...(documentListeners.get('pointerdown') || [])]) fn({}); },
    mountWithdrawal() {
      const script = html.match(/<script>\s*(document\.getElementById\('withdrawCookieConsent'\)[\s\S]*?)<\/script>/)[1];
      vm.runInContext(script, context);
    },
  };
}

const metaPages = new Set([
  'index.html', 'valuation.html', 'sell/index.html', 'rent-out/index.html',
  'sell-hdb/singapore/index.html', 'zh/sell-hdb/index.html',
  'new-launches/vela-bay.html', 'new-launches/dunearn-house.html',
  'new-launches/narra-residences.html', 'new-launches/river-modern.html',
  'new-launches/newport-residences.html',
]);

for (const rel of allHtmlFiles().filter(rel => read(rel).includes('/assets/analytics-loader.js'))) {
  test(`${rel}: actual direct-landing banner keeps vendors off until accept and preserves vendor scope`, () => {
    for (const blocked of [false, true]) {
      const h = pageHarness(rel, { blocked });
      h.context.gtag('event', 'before_choice');
      h.interact();
      h.runTimers();
      assert.equal(h.shown, true);
      assert.equal(h.scripts.length, 0);
      assert.equal(h.context.dataLayer.length, 0);
      h.click(h.declineId);
      h.interact();
      h.runTimers();
      assert.equal(h.shown, false);
      assert.equal(h.scripts.length, 0);
      assert.equal(h.context.jtGetAnalyticsConsent(), 'declined');
      assert.equal(h.session.size, 0);

      const accepted = pageHarness(rel, { blocked });
      accepted.click(accepted.acceptId); // before the delayed banner has shown
      accepted.click(accepted.acceptId);
      accepted.interact();
      accepted.runTimers();
      assert.equal(accepted.shown, false, 'a delayed banner must not reappear after a choice');
      assert.equal(accepted.scripts.length, metaPages.has(rel) ? 2 : 1);
      assert.equal(accepted.context.dataLayer.filter(args => args[0] === 'config').length, 1);
      assert.equal(typeof accepted.context.fbq === 'function', metaPages.has(rel));
      assert.equal(accepted.context.jtGetAnalyticsConsent(), 'accepted');
    }
    const declinedReturn = pageHarness(rel, { consent: 'declined' });
    declinedReturn.interact();
    declinedReturn.runTimers();
    assert.equal(declinedReturn.shown, false);
    assert.equal(declinedReturn.scripts.length, 0);
    const acceptedReturn = pageHarness(rel, { consent: 'accepted' });
    assert.equal(acceptedReturn.scripts.length, 0, 'returning visitors retain interaction-first loading');
    acceptedReturn.interact();
    acceptedReturn.runTimers();
    assert.equal(acceptedReturn.shown, false);
    assert.equal(acceptedReturn.scripts.length, metaPages.has(rel) ? 2 : 1);
  });
}

test('both banner implementations retain an explicit choice made before the deferred loader arrives', () => {
  for (const rel of ['index.html', 'new-launches/vela-bay.html']) {
    for (const accepted of [false, true]) {
      const h = pageHarness(rel, { blocked: true, deferLoader: true });
      h.click(accepted ? h.acceptId : h.declineId);
      h.load();
      h.interact();
      h.runTimers();
      assert.equal(h.shown, false);
      assert.equal(h.scripts.length, accepted ? 2 : 0);
    }
  }
});

test('actual privacy withdrawal stays disabled when saving the declined choice fails', () => {
  for (const blockedWrites of [false, true]) {
    const h = pageHarness('privacy-policy.html', { consent: 'accepted', blockedWrites });
    h.mountWithdrawal();
    h.interact();
    assert.equal(h.scripts.length, 1);
    h.click('withdrawCookieConsent');
    assert.equal(h.context.jtGetAnalyticsConsent(), 'declined');
    assert.equal(h.session.size, 0);
    assert.equal(h.reloaded, !blockedWrites, 'never reload a stale accepted storage value');
    const count = h.context.dataLayer.length;
    h.context.gtag('event', 'after_withdrawal');
    h.runTimers();
    assert.equal(h.context.dataLayer.length, count);
  }
});
