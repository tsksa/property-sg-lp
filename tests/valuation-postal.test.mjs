import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const script = read('assets/valuation-postal.js');
const origin = 'https://joetay.com';
const destination = '/valuation.html#valForm';
const initialTime = 1_800_000_000_000;

// Separate browser contexts per navigation; only the tab's storage is shared.
function visit(path, store = new Map(), options = {}) {
  const location = new URL(path, origin), document = new EventTarget();
  const onLookup = location.pathname === '/neighbour-prices/';
  const input = Object.assign(new EventTarget(), {value: '', readOnly: false, disabled: false});
  const form = new EventTarget(), events = [], analytics = [];
  input.addEventListener('input', () => events.push('input'));
  form.addEventListener('submit', e => {e.preventDefault(); events.push('lookup');});
  form.requestSubmit = () => form.dispatchEvent(new Event('submit', {cancelable: true}));
  document.readyState = 'interactive';
  document.getElementById = id => onLookup
    ? ({npForm:form, npPostal:input}[id] || null) : (id === 'postalCode' ? input : null);
  const history = {state: null, replaceState(state, _title, url) {
    this.state = state;
    location.href = new URL(url, location).href;
  }};
  const sessionStorage = {
    setItem: (k,v) => store.set(k,String(v)), getItem: k => store.get(k) ?? null,
    removeItem: k => store.delete(k),
  };
  class Clock extends Date { static now() { return options.now ?? initialTime; } }
  const context = {
    document, location, history, Event, URL, URLSearchParams, Date: Clock,
    gtag: (...args) => analytics.push(args), fbq: (...args) => analytics.push(args),
    dataLayer: [], jtTrackConversion: (...args) => analytics.push(args),
    get sessionStorage() { if (options.blocked) throw new Error('Storage blocked'); return sessionStorage; },
  };
  context.window = context;
  vm.runInNewContext(script, context);
  const beforeReady = location.href;
  document.dispatchEvent(new Event('DOMContentLoaded'));
  return {context, location, beforeReady, input, events, analytics, store};
}

function linkOnPage(source, code) {
  const link = Object.assign(new EventTarget(), {href: origin + destination, target:'', dataset:{}});
  source.context.jtBindWrittenValuation(link, code);
  function click(fields = {}) {
    const event = Object.assign(new Event('click', {cancelable: true}), {button:0, ...fields});
    link.dispatchEvent(event);
    link.onclick?.(event); // Node's EventTarget lacks the HTMLAnchorElement event property.
    return event;
  }
  return {link, click};
}

test('both entry pages scrub legacy postal parameters before their analytics loader', () => {
  for (const path of ['neighbour-prices/index.html', 'valuation.html']) {
    const html = read(path);
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
    const handoff = scripts.indexOf('/assets/valuation-postal.js');
    assert.ok(handoff >= 0 && handoff < scripts.indexOf('/assets/analytics-loader.js'), path);
  }
  const source = read('neighbour-prices/index.html');
  const cta = source.match(/<a\b[^>]*>Get a written valuation<\/a>/i)?.[0];
  assert.ok(cta?.includes('href="' + destination + '"'), 'ordinary link works without JS or storage');
  const postal = read('valuation.html').match(/<input\b[^>]*\bid="postalCode"[^>]*>/)?.[0];
  assert.ok(postal && !/\b(readonly|disabled)\b/i.test(postal));
});

test('legacy deep links retain the lookup or editable prefill, not the code in the analytics URL', () => {
  for (const [route, expectedEvent] of [['/neighbour-prices/','lookup'], ['/valuation.html','input']]) {
    const page = visit(route + '?utm_source=guide&postal=012345#section');
    assert.equal(page.beforeReady, origin + route + '?utm_source=guide#section');
    assert.equal(page.input.value, '012345');
    assert.deepEqual(page.events, [expectedEvent]);
    assert.deepEqual([...page.analytics, ...page.context.dataLayer], []);
    const bad = visit(route + '?postal=x1234y');
    assert.equal(bad.beforeReady, origin + route);
    assert.equal(bad.input.value, '');
    assert.deepEqual(bad.events, []);
  }
});

test('only normal activation hands off the last result; the writable value is consumed once and never tracked', () => {
  const source = visit('/neighbour-prices/');
  const {click, link} = linkOnPage(source, '111111');
  // The input may be changed without submitting; use the rendered result, not this text.
  source.input.value = '999999';
  source.context.jtBindWrittenValuation(link, '012345');
  assert.equal(source.store.size, 0, 'a lookup alone must not persist a postal code');
  for (const variation of [{ctrlKey:true}, {metaKey:true}, {shiftKey:true}, {altKey:true}, {button:1}]) {
    click(variation);
    assert.equal(source.store.size, 0);
  }
  click({detail:0}); // keyboard activation is a primary click with detail zero.
  assert.equal(link.href, origin + destination);
  const valuation = visit(destination, source.store);
  assert.equal(valuation.input.value, '012345');
  assert.deepEqual(valuation.events, ['input']);
  assert.equal(valuation.store.size, 0);
  assert.equal(valuation.location.href, origin + destination);
  valuation.input.value = '654321';
  assert.equal(valuation.input.value, '654321');
  assert.equal(visit(destination, source.store).input.value, '', 'no prefill on a fresh visit');
  assert.deepEqual([...source.analytics, ...valuation.analytics, ...source.context.dataLayer, ...valuation.context.dataLayer], []);
});

test('stale or inaccessible handoffs fall back to the ordinary blank form', () => {
  for (const reason of ['direct navigation','expired','malformed','blocked']) {
    const source = visit('/neighbour-prices/');
    const {click} = linkOnPage(source, '012345');
    click();
    assert.equal(source.store.size, 1);
    if (reason === 'malformed') source.store.set([...source.store.keys()][0], 'not valid JSON');
    const page = visit(reason === 'direct navigation' ? '/valuation.html' : destination, source.store, {
      blocked:reason === 'blocked', now:initialTime + (reason === 'expired' ? 86_400_000 : 0),
    });
    assert.equal(page.input.value, '', reason);
    if (reason !== 'blocked') assert.equal(visit(destination, source.store).input.value, '', reason);
  }
  const blocked = visit('/neighbour-prices/', new Map(), {blocked:true});
  const cta = linkOnPage(blocked, '012345');
  assert.equal(cta.click().defaultPrevented, false, 'normal navigation remains available');
  assert.equal(blocked.store.size, 0);
});

test('a delayed OneMap response cannot replace or hide the address for an edited prefill', async () => {
  const source = read('valuation.html').match(/function debounce\([\s\S]*?\n(?=\/\/ ── Validation)/)?.[0];
  assert.ok(source, 'valuation page postal input handler');
  const input = Object.assign(new EventTarget(), {value:'012345'});
  const address = {style:{}, appendChild() {}};
  const requests = new Map();
  let timer;
  const context = vm.createContext({
    Event, document:{
      getElementById:id => ({postalCode:input, addrDetected:address}[id] || null),
      createElement:() => ({}), createTextNode:s => s,
    },
    setTimeout:cb => {timer = cb; return 1;}, clearTimeout:() => {},
    fetch:url => new Promise((resolve, reject) => {
      requests.set(new URL(url).searchParams.get('searchVal'), {resolve, reject});
    }),
  });
  vm.runInContext(source, context);
  const oldLookup = timer();
  function edit(code) {input.value = code; input.dispatchEvent(new Event('input')); return timer();}
  const secondLookup = edit('234567');
  const lastLookup = edit('345678');
  function reply(code) {
    requests.get(code).resolve({json:async () => ({results:[{BLK_NO:'9', ROAD_NAME:'TEST ROAD', POSTAL:code}]})});
  }
  reply('345678');
  await lastLookup;
  reply('012345');
  await oldLookup;
  requests.get('234567').reject(Error('network failure'));
  await secondLookup;
  assert.match(vm.runInContext('detectedAddress', context), /345678$/);
  assert.equal(address.style.display, 'block');
  await edit('');
  assert.equal(vm.runInContext('detectedAddress', context), '');
  assert.equal(address.style.display, 'none');
});
