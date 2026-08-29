import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const helper = read('assets/conversion-tracking.js');
const key = 'jt_lead_attribution_v1';

function harness({ consent, session = new Map(), search = '', pathname = '/', blocked = false, now = 1000000 } = {}) {
  const local = new Map(consent ? [['pdpa_consent', consent]] : []);
  const events = [], pixels = [], clicks = [], messages = [];
  const storage = map => ({
    getItem(k) { if (blocked) throw Error('blocked'); return map.get(k) ?? null; },
    setItem(k, v) { if (blocked) throw Error('blocked'); map.set(k, v); },
    removeItem(k) { if (blocked) throw Error('blocked'); map.delete(k); },
  });
  const context = vm.createContext({
    URLSearchParams, Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    localStorage: storage(local), sessionStorage: storage(session),
    location: { pathname, search, href: `https://joetay.com${pathname}${search}` },
    document: { addEventListener(type, callback) { if (type === 'click') clicks.push(callback); } },
    gtag: (...args) => events.push(args), fbq: (...args) => pixels.push(args),
    addEventListener(type, callback) { if (type === 'message') messages.push(callback); },
  });
  context.window = context;
  vm.runInContext(helper, context);
  return {
    context, events, pixels, session, local,
    attribution: () => JSON.parse(JSON.stringify(context.jtGetLeadAttribution())),
    click(id) { clicks.forEach(fn => fn({ target: { closest: selector => selector.split(', ').includes(`#${id}`) ? {} : null } })); },
    contact(href, attributes = {}) {
      const a = {
        href,
        textContent: 'Contact Joe',
        getAttribute: name => name === 'href' ? href : (attributes[name] ?? null),
      };
      clicks.forEach(fn => fn({ target: { closest: selector => selector === 'a[href]' ? a : null } }));
    },
    booking(origin) { messages.forEach(fn => fn({ origin, data: { event: 'calendly.event_scheduled' } })); },
  };
}

test('one successful homepage form produces exactly one GA4 and one Meta lead', () => {
  const h = harness();
  const html = read('index.html');
  const success = html.slice(html.indexOf('function showFormSuccess('), html.indexOf('function showFormError('));
  vm.runInContext(success, h.context);
  h.context.showFormSuccess({ innerHTML: '', querySelector: () => ({ focus() {} }) }, 'Done', 'Thanks', { lead_type: 'consultation' });
  assert.equal(h.events.filter(e => e[1] === 'generate_lead').length, 1);
  assert.equal(h.pixels.filter(e => e[1] === 'Lead').length, 1);
});

test('contact intent stays separate from leads and only genuine Calendly-origin messages count', () => {
  const h = harness();
  h.contact('https://wa.me/6581881488');
  assert.equal(h.events[0][1], 'contact_click');
  assert.equal(h.events[0][2].contact_method, 'whatsapp');
  assert.equal(h.pixels[0][1], 'ContactClick');
  h.booking('https://example.com');
  assert.equal(h.events.length, 1);
  h.booking('https://calendly.com');
  assert.equal(h.events[1][1], 'generate_lead');
  assert.equal(h.events[1][2].lead_type, 'calendly_booking');
});

test('lead form funnel records fixed stages without form values or duplicate starts', () => {
  const h = harness();
  const listeners = {};
  const attrs = {};
  const form = {
    id: 'heroForm',
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    setAttribute(name, value) { attrs[name] = value; },
    getAttribute(name) { return attrs[name] ?? null; },
  };
  h.context.jtObserveLeadForm(form, {leadType:'consultation'});
  listeners.input[0]({target:{value:'private name'}});
  listeners.input[0]({target:{value:'private phone'}});
  h.context.jtTrackLeadFormStage(form, 'start');
  h.context.jtTrackLeadFormStage(form, 'submit_attempt');
  h.context.jtTrackLeadFormStage(form, 'recovery', {failure_type:'submission_error'});
  h.context.jtTrackLeadFormStage(form, 'success');

  assert.deepEqual(h.events.map(event => event[1]), [
    'lead_form_start',
    'lead_form_submit_attempt',
    'lead_form_recovery',
    'lead_form_submit_success',
  ]);
  for(const event of h.events){
    assert.equal(event[2].form_id, 'heroForm');
    assert.equal(event[2].lead_type, 'consultation');
    assert.doesNotMatch(JSON.stringify(event[2]), /private name|private phone/);
  }
  assert.equal(h.pixels.length, 0);
});

test('lead form funnel collapses native invalid fields into one validation event', () => {
  const h = harness();
  const listeners = {};
  const attrs = {};
  let timer;
  h.context.setTimeout = callback => { timer = callback; return 1; };
  const form = {
    id: 'footerNewsletter',
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    setAttribute(name, value) { attrs[name] = value; },
    getAttribute(name) { return attrs[name] ?? null; },
  };
  h.context.jtObserveLeadForm(form, {leadType:'newsletter_signup'});
  listeners.invalid[0]({});
  listeners.invalid[0]({});
  timer();

  assert.deepEqual(h.events.map(event => event[1]), [
    'lead_form_start',
    'lead_form_validation_error',
  ]);
  assert.equal(h.events[1][2].error_count, 2);
});

test('homepage wires all lead forms to privacy-safe funnel stages', () => {
  const html = read('index.html');
  for(const [id, leadType] of [
    ['heroForm','consultation'],
    ['valPopupForm','valuation'],
    ['exitForm','newsletter_signup'],
    ['footerNewsletter','newsletter_signup'],
    ['finalForm','final_cta_consultation'],
  ]){
    assert.match(html, new RegExp(`\\['${id}','${leadType}'\\]`));
  }
  assert.match(html, /jtTrackLeadFormStage\(form,'submit_attempt'/);
  assert.match(html, /jtTrackLeadFormStage\(form,'success'/);
  assert.match(html, /jtTrackLeadFormStage\(form,'recovery'/);
  assert.doesNotMatch(html, /jtTrackLeadFormStage\([^)]*(?:full_name|mobile_number|email_address)/);
});

test('form recovery keeps fields in place and exposes a tracked WhatsApp fallback', () => {
  const h = harness();
  let banner = null;
  const makeNode = tagName => ({
    tagName: tagName.toUpperCase(),
    attrs: {}, children: [], style: {}, textContent: '', focused: false,
    setAttribute(name, value) { this.attrs[name] = value; },
    appendChild(child) { this.children.push(child); child.parentNode = this; },
    focus() { this.focused = true; },
  });
  const container = {
    insertBefore(child) { banner = child; child.parentNode = this; },
  };
  const submit = { parentNode: container, nextSibling: null };
  const form = {
    querySelector(selector) {
      if(selector === 'button[type="submit"]') return submit;
      if(selector === '[data-jt-form-recovery]') return banner;
      return null;
    },
    appendChild(child) { banner = child; },
  };
  h.context.document.createElement = makeNode;
  h.context.document.createTextNode = text => ({ textContent: text });

  const result = h.context.jtShowFormRecovery(form, {
    leadType: 'valuation',
    ctaLocation: 'valuation_form_recovery',
    whatsappText: 'Hi Joe, valuation help please',
  });

  assert.equal(result, banner);
  assert.equal(banner.attrs.role, 'alert');
  assert.equal(banner.attrs.tabindex, '-1');
  assert.equal(banner.focused, true);
  const link = banner.children.find(child => child.tagName === 'A');
  assert.ok(link.href.includes('text=Hi%20Joe%2C%20valuation%20help%20please'));
  assert.equal(link.attrs['data-cta-location'], 'valuation_form_recovery');
  assert.equal(link.attrs['data-lead-type'], 'valuation');

  h.contact(link.href, link.attrs);
  assert.equal(h.events[0][2].cta_location, 'valuation_form_recovery');
  assert.equal(h.events[0][2].lead_type, 'valuation');
});

test('shared lead validation persists field errors and moves focus to the first invalid field', () => {
  const h = harness();
  const nodes = [];
  const makeNode = tagName => ({
    tagName: tagName.toUpperCase(), attrs: {}, hidden: false, style: {}, textContent: '',
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] ?? null; },
    removeAttribute(name) { delete this.attrs[name]; },
  });
  const parent = {
    insertBefore(node) { nodes.push(node); node.parentNode = this; },
  };
  const field = {
    parentNode: parent, nextSibling: null, valid: false, focused: false, attrs: {},
    checkValidity() { return this.valid; },
    focus() { this.focused = true; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] ?? null; },
    removeAttribute(name) { delete this.attrs[name]; },
  };
  const submit = { parentNode: parent };
  const form = {
    id: 'testForm', elements: {name: field},
    querySelector(selector) {
      if(selector === 'button[type="submit"]') return submit;
      if(selector === '[data-jt-validation-summary]') return nodes.find(node => 'data-jt-validation-summary' in node.attrs) || null;
      const match = selector.match(/\[data-jt-field-error="(.+)"\]/);
      return match ? nodes.find(node => node.attrs['data-jt-field-error'] === match[1]) || null : null;
    },
    appendChild(node) { nodes.push(node); },
  };
  h.context.document.createElement = makeNode;

  assert.equal(h.context.jtValidateLeadForm(form, [{name:'name',message:'Please enter your name.'}]), false);
  const error = nodes.find(node => node.attrs['data-jt-field-error'] === 'name');
  const summary = nodes.find(node => 'data-jt-validation-summary' in node.attrs);
  assert.equal(field.attrs['aria-invalid'], 'true');
  assert.equal(field.attrs['aria-describedby'], 'testForm-name-error');
  assert.equal(error.textContent, 'Please enter your name.');
  assert.equal(error.hidden, false);
  assert.equal(summary.attrs.role, 'alert');
  assert.match(summary.textContent, /Please enter your name\./);
  assert.equal(field.focused, true);

  field.valid = true;
  assert.equal(h.context.jtValidateLeadForm(form, [{name:'name'}]), true);
  assert.equal(field.attrs['aria-invalid'], undefined);
  assert.equal(field.attrs['aria-describedby'], undefined);
  assert.equal(error.hidden, true);
  assert.equal(summary.hidden, true);
});

test('shared spam-floor wait preserves a valid fast submission instead of dropping its click', () => {
  const h = harness({now: 1000000});
  let timer = null;
  h.context.setTimeout = callback => { timer = callback; return 1; };
  const nodes = [];
  const makeNode = tagName => ({
    tagName: tagName.toUpperCase(), attrs: {}, hidden: false, style: {}, textContent: '',
    setAttribute(name, value) { this.attrs[name] = String(value); },
  });
  const parent = { insertBefore(node) { nodes.push(node); node.parentNode = this; } };
  const submit = {parentNode: parent, innerHTML: 'Send', textContent: 'Send', disabled: false};
  const form = {
    querySelector(selector) {
      if(selector === 'button[type="submit"]') return submit;
      if(selector === '[data-jt-form-wait]') return nodes.find(node => 'data-jt-form-wait' in node.attrs) || null;
      return null;
    },
    appendChild(node) { nodes.push(node); },
  };
  h.context.document.createElement = makeNode;
  let retries = 0;

  assert.equal(h.context.jtWaitForSpamFloor(form, 999900, 3000, () => { retries += 1; }), false);
  assert.equal(submit.disabled, true);
  assert.equal(nodes[0].attrs.role, 'status');
  assert.equal(typeof timer, 'function');
  timer();
  assert.equal(retries, 1);
  assert.equal(submit.disabled, false);
  assert.equal(nodes[0].hidden, true);
});

test('high-intent form failures use the shared non-blocking recovery UI', () => {
  const directPaths = [
    'valuation.html',
    'sell/index.html',
    'rent-out/index.html',
    'new-launches/new-launches.js',
    'new-launches/project-page-form.js',
  ];
  for(const file of directPaths){
    const source = read(file);
    assert.match(source, /jtShowFormRecovery/, `${file}: shared recovery helper missing`);
    assert.doesNotMatch(source, /alert\(["']Sorry, something went wrong/, `${file}: blocking failure alert remains`);
  }

  const launchDir = new URL('../new-launches/', import.meta.url);
  for(const entry of fs.readdirSync(launchDir).filter(name => name.endsWith('.html'))){
    const source = read(`new-launches/${entry}`);
    if(!source.includes('id="projectForm"') || source.includes('project-page-form.js')) continue;
    assert.match(source, /jtShowFormRecovery/, `${entry}: inline project form lacks shared recovery`);
    assert.doesNotMatch(source, /alert\(["']Sorry, something went wrong/, `${entry}: blocking failure alert remains`);
  }
});

test('decline disables the actual measurement ID, clears attribution and stops events on this page', () => {
  for (const id of ['cookieDecline', 'jtConsentDecline']) {
    const h = harness({ consent: 'accepted', search: '?utm_source=facebook' });
    assert.ok(h.session.has(key));
    h.click(id);
    assert.equal(h.context['ga-disable-G-1YQE8JN66P'], true);
    assert.equal(h.session.has(key), false);
    h.context.gtag('event', 'inline_event', {});
    h.context.jtTrackConversion('generate_lead', {});
    h.contact('tel:+6581881488');
    h.booking('https://calendly.com');
    assert.equal(h.events.length, 0);
    assert.equal(h.pixels.length, 0);
    assert.deepEqual(h.attribution(), {});
  }
});

test('returning declined visitors never enqueue helper conversion events', () => {
  const h = harness({ consent: 'declined', search: '?utm_source=facebook' });
  assert.equal(h.context['ga-disable-G-1YQE8JN66P'], true);
  h.context.jtTrackConversion('generate_lead', {});
  assert.equal(h.events.length, 0);
  assert.equal(h.pixels.length, 0);
  assert.equal(h.session.size, 0);
});

test('no campaign persistence until acceptance; both banners capture the current entry', () => {
  for (const id of ['cookieAccept', 'jtConsentAccept']) {
    const h = harness({ search: '?utm_source=facebook&utm_campaign=hdb_aug26', pathname: '/insights/hdb-income-ceiling-2026-ndr-changes.html' });
    assert.equal(h.session.size, 0);
    h.click(id);
    assert.ok(h.session.has(key));
    h.local.set('pdpa_consent', 'accepted');
    assert.equal(h.attribution().utm_campaign, 'hdb_aug26');
  }
});

test('accepted campaign survives article-to-homepage navigation without mixing later campaigns', () => {
  const article = harness({ consent: 'accepted', pathname: '/insights/hdb-income-ceiling-2026-ndr-changes.html', search: '?utm_source=facebook&utm_medium=social&utm_campaign=hdb_aug26' });
  const home = harness({ consent: 'accepted', session: article.session });
  assert.deepEqual(home.attribution(), {
    landing_page: '/insights/hdb-income-ceiling-2026-ndr-changes.html',
    utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'hdb_aug26',
  });
  const later = harness({ consent: 'accepted', session: article.session, pathname: '/calculator/', search: '?utm_source=newsletter' });
  assert.deepEqual(later.attribution(), { landing_page: '/calculator/', utm_source: 'newsletter' });
  assert.match(read('index.html'), /typeof window\.jtGetLeadAttribution==='function'\?window\.jtGetLeadAttribution\(\):_utm/);
});

test('homepage submission uses consented entry attribution in the actual request body', async () => {
  const article = harness({ consent: 'accepted', pathname: '/insights/hdb-income-ceiling-2026-ndr-changes.html', search: '?utm_source=facebook&utm_campaign=hdb_aug26' });
  const home = harness({ consent: 'accepted', session: article.session });
  const html = read('index.html');
  const submit = html.slice(html.indexOf("const FORM_ENDPOINT="), html.indexOf('function showFormSuccess('));
  let body;
  // In-memory stub only: never submits a production lead or sends an event.
  home.context.fetch = async (url, options) => {
    assert.equal(url, '/.netlify/functions/submit-lead');
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  vm.runInContext(submit, home.context);
  await home.context.submitLead({ lead_type: 'consultation' });
  assert.equal(body.utm_source, 'facebook');
  assert.equal(body.utm_campaign, 'hdb_aug26');
  assert.equal(body.landing_page, '/insights/hdb-income-ceiling-2026-ndr-changes.html');
  assert.equal(body.source_site, 'joetay.com');
  assert.equal(home.events.length, 0);
  home.click('cookieDecline');
  await home.context.submitLead({ lead_type: 'consultation' });
  assert.equal(body.utm_source, undefined);
  assert.equal(body.landing_page, undefined);
});

test('malformed, expired and future-dated records are not reused', () => {
  for (const raw of ['{', 'null', JSON.stringify({ expiresAt: 0, utm_source: 'stale' }), JSON.stringify({ expiresAt: 999999999, utm_source: 'future' })]) {
    const h = harness({ consent: 'accepted', session: new Map([[key, raw]]) });
    assert.deepEqual(h.attribution(), { landing_page: '/' });
  }
  const first = harness({ consent: 'accepted', search: '?utm_source=facebook' });
  const expired = harness({ consent: 'accepted', session: first.session, now: 2800001 });
  assert.deepEqual(expired.attribution(), { landing_page: '/' });
});

test('storage errors do not break forms, and unknown URL fields are never persisted', () => {
  const h = harness({ blocked: true, search: '?utm_source=facebook' });
  assert.equal(h.attribution().utm_source, 'facebook');
  h.context.jtTrackConversion('generate_lead', {});
  assert.equal(h.events.length, 1);
  const filtered = harness({ consent: 'accepted', search: '?utm_source=facebook&utm_campaign=joe%40example.com&email=private%40example.com&gclid=secret&mobile=12345' });
  assert.deepEqual(filtered.attribution(), { landing_page: '/', utm_source: 'facebook' });
  assert.doesNotMatch(filtered.session.get(key), /example|gclid|mobile|secret/);
});

test('placeholder Ads conversions remain suppressed while valid labels still pass', () => {
  const h = harness();
  h.context.gtag('event', 'conversion', { send_to: 'AW-123/PLACEHOLDER_WHATSAPP' });
  assert.equal(h.events.length, 0);
  h.context.gtag('event', 'conversion', { send_to: 'AW-123/real-label' });
  assert.equal(h.events.length, 1);
});
