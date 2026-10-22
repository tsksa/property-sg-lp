import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const loader = fs.readFileSync(new URL('../assets/analytics-loader.js', import.meta.url), 'utf8');

function harness({ consent = null, readyState = 'loading', meta = true, blocked = false } = {}) {
  const storage = new Map(consent ? [['pdpa_consent', consent]] : []);
  const nodes = [];
  const documentListeners = new Map();
  const windowListeners = new Map();
  const timers = new Map();
  let timerId = 0;

  function addListener(store, type, callback) {
    const callbacks = store.get(type) || [];
    callbacks.push(callback);
    store.set(type, callbacks);
  }

  function removeListener(store, type, callback) {
    store.set(type, (store.get(type) || []).filter(item => item !== callback));
  }

  const document = {
    readyState,
    currentScript: { dataset: { meta: String(meta) } },
    head: { appendChild(node) { nodes.push(node); } },
    createElement(tagName) { return { tagName: tagName.toUpperCase() }; },
    getElementById(id) { return nodes.find(node => node.id === id) || null; },
    addEventListener(type, callback) { addListener(documentListeners, type, callback); },
    removeEventListener(type, callback) { removeListener(documentListeners, type, callback); },
  };

  const context = vm.createContext({
    Date,
    document,
    localStorage: {
      getItem(key) { if(blocked) throw Error('storage blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if(blocked) throw Error('storage blocked'); storage.set(key, value); },
    },
    sessionStorage: { removeItem() {} },
    addEventListener(type, callback) { addListener(windowListeners, type, callback); },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  context.window = context;
  vm.runInContext(loader, context);

  return {
    context,
    storage,
    nodes,
    fireDocument(type, event = {}) {
      for (const callback of [...(documentListeners.get(type) || [])]) callback(event);
    },
    fireWindow(type, event = {}) {
      for (const callback of [...(windowListeners.get(type) || [])]) callback(event);
    },
    runTimers() {
      for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
      }
    },
    scriptSources() { return nodes.filter(node => node.tagName === 'SCRIPT').map(node => node.src); },
    queuedGoogleCalls() { return context.dataLayer.map(args => Array.from(args)); },
    queuedMetaCalls() { return context.fbq ? context.fbq.queue.map(args => Array.from(args)) : []; },
  };
}

test('without accepted consent the queues exist but vendors never download', () => {
  const h = harness();
  assert.equal(typeof h.context.gtag, 'function');
  assert.equal(h.context.fbq, undefined);
  h.fireDocument('pointerdown');
  h.fireWindow('load');
  h.runTimers();
  assert.deepEqual(h.scriptSources(), []);
});

test('an accepted returning visitor loads both vendors once on first interaction', () => {
  const h = harness({ consent: 'accepted' });
  assert.deepEqual(h.scriptSources(), []);
  assert.equal(typeof h.context.fbq, 'function');

  h.fireDocument('pointerdown');
  h.fireDocument('keydown');

  assert.deepEqual(h.scriptSources(), [
    'https://www.googletagmanager.com/gtag/js?id=GT-KVFDZD5V',
    'https://connect.facebook.net/en_US/fbevents.js',
  ]);
  assert.equal(h.queuedGoogleCalls().filter(call => call[0] === 'config').length, 1);
  assert.equal(h.queuedMetaCalls().filter(call => call[0] === 'track' && call[1] === 'PageView').length, 1);
  assert.equal(h.queuedMetaCalls().find(call => call[0] === 'init')[1], '3279494272146114');
});

test('an accepted returning visitor loads vendors after the post-load fallback', () => {
  const h = harness({ consent: 'accepted', readyState: 'complete' });
  assert.deepEqual(h.scriptSources(), []);
  h.runTimers();
  assert.equal(h.scriptSources().length, 2);
});

test('same-page acceptance loads vendors after the banner stores consent', () => {
  const h = harness();
  h.storage.set('pdpa_consent', 'accepted');
  h.fireDocument('click', {
    target: { closest(selector) { return selector.includes('#cookieAccept') ? {} : null; } },
  });
  h.fireDocument('click', {
    target: { closest(selector) { return selector.includes('#cookieAccept') ? {} : null; } },
  });
  assert.equal(h.scriptSources().length, 2);
  assert.equal(h.queuedGoogleCalls().filter(call => call[0] === 'config').length, 1);
});

test('a Google-only page never queues or downloads the Meta pixel', () => {
  const h = harness({ consent: 'accepted', meta: false });
  h.fireDocument('pointerdown');

  assert.deepEqual(h.scriptSources(), [
    'https://www.googletagmanager.com/gtag/js?id=GT-KVFDZD5V',
  ]);
  assert.equal(h.context.fbq, undefined);
});

test('declined consent never loads vendors, including after interaction and fallback', () => {
  const h = harness({ consent: 'declined', readyState: 'complete' });
  h.fireDocument('pointerdown');
  h.runTimers();
  assert.deepEqual(h.scriptSources(), []);
});

test('withdrawal before deferred load prevents a pending interaction or fallback from loading vendors', () => {
  const h = harness({ consent: 'accepted', readyState: 'complete' });
  h.context.jtSetAnalyticsConsent('declined');
  h.fireDocument('pointerdown');
  h.runTimers();
  assert.deepEqual(h.scriptSources(), []);
});


test('unavailable storage defaults off but an explicit choice works for this document', () => {
  const h = harness({ blocked: true, readyState: 'complete' });
  h.context.gtag('event', 'before_accept');
  h.fireDocument('pointerdown');
  h.runTimers();
  assert.deepEqual(h.scriptSources(), []);
  assert.equal(h.queuedGoogleCalls().length, 0);
  h.context.jtSetAnalyticsConsent('accepted');
  h.context.jtSetAnalyticsConsent('accepted');
  assert.equal(h.scriptSources().length, 2);
  assert.equal(h.queuedGoogleCalls().filter(call => call[0] === 'config').length, 1);
  h.context.gtag('event', 'after_accept');
  assert.equal(h.queuedGoogleCalls().filter(call => call[0] === 'event').length, 1);
  assert.equal(h.context.jtGetAnalyticsConsent(), 'accepted');
  const nextVisit = harness({ blocked: true });
  nextVisit.fireDocument('pointerdown');
  assert.deepEqual(nextVisit.scriptSources(), []);
});

for (const blocked of [false, true]) {
  test(`withdrawal stops later calls to loaded vendors (storage blocked: ${blocked})`, () => {
    const h = harness({ blocked });
    h.context.jtSetAnalyticsConsent('accepted');
    const delivered = [];
    h.context.fbq.callMethod = (...args) => delivered.push(args);
    h.context.gtag('event', 'accepted_event');
    h.context.fbq('track', 'Lead');
    h.context.jtSetAnalyticsConsent('declined');
    const googleCount = h.queuedGoogleCalls().length;
    const metaCount = delivered.length;
    h.context.gtag('event', 'withdrawn_event');
    h.context.fbq('track', 'Lead');
    h.fireDocument('pointerdown');
    h.runTimers();
    assert.equal(h.queuedGoogleCalls().length, googleCount);
    assert.equal(delivered.length, metaCount);
    assert.deepEqual(delivered.at(-1), ['consent', 'revoke']);
    assert.equal(h.queuedGoogleCalls().at(-1)[2].analytics_storage, 'denied');
    assert.equal(h.context['ga-disable-G-1YQE8JN66P'], true);
    assert.equal(h.context['ga-disable-GT-KVFDZD5V'], true);
    assert.equal(h.scriptSources().length, 2);
  });
}

test('cross-tab withdrawal and storage clearing cancel pending loads and stop loaded calls', () => {
  for (const alreadyLoaded of [false, true]) {
    for (const event of [{ key: 'pdpa_consent', newValue: 'declined' }, { key: null }]) {
      const h = harness({ consent: 'accepted', readyState: 'complete' });
      if (alreadyLoaded) h.fireDocument('keydown');
      h.fireWindow('storage', event);
      const googleCount = h.queuedGoogleCalls().length;
      const metaCount = h.queuedMetaCalls().length;
      h.context.gtag('event', 'after_withdrawal');
      if(h.context.fbq) h.context.fbq('track', 'Lead');
      h.fireDocument('pointerdown');
      h.runTimers();
      assert.equal(h.scriptSources().length, alreadyLoaded ? 2 : 0);
      assert.equal(h.queuedGoogleCalls().length, googleCount);
      assert.equal(h.queuedMetaCalls().length, metaCount);
    }
  }
});

test('pre-consent events are discarded rather than replayed after later acceptance', () => {
  const h = harness();
  h.context.gtag('event', 'before_accept');
  h.context.gtag('config', 'G-SHOULD-NOT-BE-QUEUED');
  h.context.jtSetAnalyticsConsent('accepted');
  assert.equal(h.queuedGoogleCalls().some(call => call[1] === 'before_accept'), false);
  assert.equal(h.queuedGoogleCalls().some(call => call[1] === 'G-SHOULD-NOT-BE-QUEUED'), false);
});
