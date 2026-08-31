import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const loader = fs.readFileSync(new URL('../assets/analytics-loader.js', import.meta.url), 'utf8');

function harness({ consent = null, readyState = 'loading' } = {}) {
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
    head: { appendChild(node) { nodes.push(node); } },
    createElement(tagName) { return { tagName: tagName.toUpperCase() }; },
    getElementById(id) { return nodes.find(node => node.id === id) || null; },
    addEventListener(type, callback) { addListener(documentListeners, type, callback); },
    removeEventListener(type, callback) { removeListener(documentListeners, type, callback); },
  };

  const context = vm.createContext({
    Date,
    document,
    localStorage: { getItem(key) { return storage.get(key) ?? null; } },
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
    fireWindow(type) {
      for (const callback of [...(windowListeners.get(type) || [])]) callback();
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
