import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const serverFloor = Number(read('netlify/functions/submit-lead.js').match(/tOnForm\s*<\s*(\d+)/)[1]);
const projects = [
  ['vela-bay', 'Vela Bay', 'Typically within 1 hour during 9am–9pm.'],
  ['dunearn-house', 'Dunearn House', 'the virtual tour link.'],
  ['narra-residences', 'Narra Residences', 'the virtual tour links.'],
  ['river-modern', 'River Modern', 'the 4 Matterport tour links.'],
  ['newport-residences', 'Newport Residences', 'the virtual tour link.'],
];

// Execute the real helper without booting unrelated tracking/DOM listeners.
const tracking = read('assets/conversion-tracking.js');
const helperStart = tracking.indexOf('  window.jtWaitForSpamFloor = function(');
const helperEnd = tracking.indexOf('\n  function classifyLink(', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'shared timing helper extraction failed');
const waitHelper = tracking.slice(helperStart, helperEnd);

function harness(slug, { sharedHelper = true } = {}) {
  const html = read(`new-launches/${slug}.html`);
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]).find((value) => value.includes('async function handleSubmit('));
  assert.ok(script, `${slug}: actual inline enquiry handler not found`);

  const startedAt = Date.parse('2026-10-22T09:00:00Z');
  let now = startedAt;
  let timerId = 0;
  let valid = true;
  let validations = 0;
  let focused = 0;
  const timers = new Map();
  const calls = [];
  const recoveries = [];
  const analytics = [];
  const nodes = [];
  const listeners = new Map();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const submit = {
    innerHTML: 'Send enquiry →', textContent: 'Send enquiry →', disabled: false,
    parentNode: { insertBefore(node) { nodes.push(node); } },
  };
  const fields = {
    name: { value: '  Test Buyer  ' },
    phone: { value: ' 91234567 ' },
    email: { value: ' buyer@example.test ' },
    interest: { value: '2 BR' },
    company_website: { value: '' },
  };
  let formHtml = '';
  const form = {
    ...fields,
    get innerHTML() { return formHtml; },
    set innerHTML(value) {
      formHtml = value;
      // Browser named controls disappear when the success message replaces them.
      if (value) for (const field of Object.keys(fields)) delete this[field];
    },
    reportValidity() { validations += 1; return valid; },
    querySelector(selector) {
      if (selector.startsWith('button[')) return this.innerHTML ? null : submit;
      if (selector === '[data-jt-form-wait]') return nodes.find((node) => 'data-jt-form-wait' in node.attrs) || null;
      if (selector.includes('h3') && this.innerHTML.includes('<h3')) return { focus() { focused += 1; } };
      return null;
    },
    appendChild(node) { nodes.push(node); },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const context = vm.createContext({
    Date: ClockDate,
    URLSearchParams,
    location: { search: '?utm_source=audit&utm_medium=test&utm_campaign=timing&utm_term=launch&utm_content=form' },
    document: {
      getElementById(id) { assert.equal(id, 'projectForm'); return form; },
      createElement(tagName) {
        return { tagName: tagName.toUpperCase(), attrs: {}, style: {}, hidden: false,
          setAttribute(name, value) { this.attrs[name] = value; } };
      },
    },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, due: now + Number(delay) });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      assert.equal(url, '/.netlify/functions/submit-lead');
      assert.equal(options.method, 'POST');
      const call = { url, payload: JSON.parse(options.body) };
      calls.push(call);
      return new Promise((resolve, reject) => { call.resolve = resolve; call.reject = reject; });
    },
    jtShowFormRecovery(received, options) {
      assert.equal(received, form);
      recoveries.push(options);
    },
    gtag: (...args) => analytics.push(['google', ...args]),
    fbq: (...args) => analytics.push(['meta', ...args]),
  });
  context.window = context;
  if (sharedHelper) vm.runInContext(waitHelper, context);
  vm.runInContext(script, context);
  assert.equal(typeof listeners.get('submit'), 'function', 'form wires its submit handler');

  const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
  return {
    form, fields, submit, calls, recoveries, analytics, nodes,
    get validations() { return validations; },
    get focused() { return focused; },
    get timerCount() { return timers.size; },
    setValid(value) { valid = value; },
    submitForm() { return context.handleSubmit(form); },
    fireSubmit() {
      let prevented = false;
      listeners.get('submit')({ target: form, preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    },
    async advanceTo(elapsed) {
      const target = startedAt + elapsed;
      assert.ok(target >= now, 'test clock cannot move backwards');
      let fired = 0;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= target)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        assert.ok(++fired < 20, 'unexpected timer loop');
        const [id, timer] = next;
        now = timer.due;
        timers.delete(id);
        timer.callback();
        await settle();
      }
      now = target;
      await settle();
    },
    async respond(index, kind = 'success') {
      const call = calls[index];
      assert.ok(call, 'response requires a captured request');
      if (kind === 'network') call.reject(new Error('mock network failure'));
      else call.resolve({
        ok: kind !== 'http', status: kind === 'http' ? 502 : 200,
        async json() {
          if (kind === 'malformed') throw new SyntaxError('mock invalid JSON');
          if (kind === 'ok-false') return { ok: false };
          if (kind === 'missing-ok') return {};
          if (kind === 'truthy-ok') return { ok: 'true' };
          // A body claiming success must not override a failed HTTP status.
          return { ok: true };
        },
      });
      await settle();
    },
  };
}

for (const [slug, name, successCopy] of projects) {
  for (const sharedHelper of [true, false]) {
    const variant = `${slug}, ${sharedHelper ? 'shared wait helper' : 'helper unavailable'}`;

    test(`${variant}: fast submissions wait once, then send current values at the server floor`, async () => {
      for (const elapsed of [0, 1000, serverFloor - 1]) {
        const h = harness(slug, { sharedHelper });
        await h.advanceTo(elapsed);
        h.fireSubmit();
        h.submitForm();
        assert.equal(h.calls.length, 0, `no request at ${elapsed}ms`);
        assert.equal(h.timerCount, 1, 'duplicate submit must not queue a second timer');
        assert.equal(h.submit.disabled, true);
        assert.equal(h.form.innerHTML, '');
        assert.equal(h.analytics.length, 0);
        h.fields.interest.value = '3 BR';
        await h.advanceTo(serverFloor - 1);
        assert.equal(h.calls.length, 0, 'still no request just below the floor');
        await h.advanceTo(serverFloor);
        assert.equal(h.calls.length, 1);
        assert.equal(h.calls[0].payload.time_on_form_ms, serverFloor);
        assert.equal(h.calls[0].payload.interest, '3 BR', 'payload reads current fields after wait');
        assert.ok(h.validations >= 2, 'queued submission revalidates before sending');
        h.submitForm();
        assert.equal(h.calls.length, 1, 'in-flight request must not duplicate');
        assert.equal(h.submit.disabled, true);
        await h.respond(0);
        assert.match(h.form.innerHTML, /role="status"/);
        assert.ok(h.form.innerHTML.includes(name));
        assert.ok(h.form.innerHTML.includes(successCopy), 'project-specific confirmation is preserved');
        assert.equal(h.focused, 1);
        assert.equal(h.analytics.filter((call) => call[0] === 'google' && call[2] === 'generate_lead').length, 1);
        assert.equal(h.analytics.filter((call) => call[0] === 'meta' && call[2] === 'Lead').length, 1);
        await h.submitForm();
        assert.equal(h.calls.length, 1, 'a late event cannot resubmit the replaced success form');
        assert.equal(h.analytics.filter((call) => call[0] === 'google' && call[2] === 'generate_lead').length, 1);
        assert.equal(h.analytics.filter((call) => call[0] === 'meta' && call[2] === 'Lead').length, 1);
      }
    });

    test(`${variant}: submissions at or after the floor send immediately and preserve payload metadata`, async () => {
      for (const elapsed of [serverFloor, serverFloor + 1000]) {
        const h = harness(slug, { sharedHelper });
        await h.advanceTo(elapsed);
        const pending = h.submitForm();
        assert.equal(h.calls.length, 1);
        assert.equal(h.timerCount, 0);
        const data = h.calls[0].payload;
        assert.deepEqual({
          project: data.project, landing_page: data.landing_page, source_site: data.source_site,
          lead_type: data.lead_type, request_type: data.request_type, full_name: data.full_name,
          mobile_number: data.mobile_number, email: data.email, interest: data.interest,
          time_on_form_ms: data.time_on_form_ms,
        }, {
          project: name, landing_page: `/new-launches/${slug}.html`, source_site: 'joetay.com',
          lead_type: 'new_launch_registration', request_type: 'interest', full_name: 'Test Buyer',
          mobile_number: '91234567', email: 'buyer@example.test', interest: '2 BR', time_on_form_ms: elapsed,
        });
        assert.equal(data.utm_source, 'audit');
        assert.equal(data.utm_medium, 'test');
        assert.equal(data.utm_campaign, 'timing');
        assert.equal(data.utm_term, 'launch');
        assert.equal(data.utm_content, 'form');
        assert.ok(Number.isFinite(Date.parse(data.submitted_at)));
        h.submitForm();
        assert.equal(h.calls.length, 1);
        await h.respond(0);
        await pending;
      }
    });

    test(`${variant}: invalid fields and honeypots do not queue or submit`, async () => {
      const invalid = harness(slug, { sharedHelper });
      invalid.setValid(false);
      await invalid.submitForm();
      assert.equal(invalid.timerCount, 0);
      assert.equal(invalid.calls.length, 0);
      assert.equal(invalid.submit.disabled, false);
      const bot = harness(slug, { sharedHelper });
      bot.fields.company_website.value = 'filled';
      await bot.submitForm();
      assert.equal(bot.timerCount, 0);
      assert.equal(bot.calls.length, 0);
      const queuedBot = harness(slug, { sharedHelper });
      queuedBot.submitForm();
      queuedBot.fields.company_website.value = 'filled while waiting';
      await queuedBot.advanceTo(serverFloor);
      assert.equal(queuedBot.calls.length, 0, 'honeypot is rechecked when the timer expires');
      assert.equal(queuedBot.submit.disabled, false);
    });

    test(`${variant}: a form changed to invalid while queued can recover without losing its values`, async () => {
      const h = harness(slug, { sharedHelper });
      h.submitForm();
      assert.equal(h.calls.length, 0);
      assert.equal(h.timerCount, 1);
      h.setValid(false);
      h.fields.phone.value = 'bad phone';
      await h.advanceTo(serverFloor);
      assert.equal(h.calls.length, 0);
      assert.equal(h.submit.disabled, false);
      assert.equal(h.timerCount, 0);
      assert.equal(h.form.innerHTML, '');
      h.fields.phone.value = '91234567';
      h.setValid(true);
      const pending = h.submitForm();
      assert.equal(h.calls.length, 1);
      await h.respond(0);
      await pending;
    });

    test(`${variant}: failed or unconfirmed responses retain the form and allow one retry`, async () => {
      for (const kind of ['http', 'network', 'malformed', 'ok-false', 'missing-ok', 'truthy-ok']) {
        const h = harness(slug, { sharedHelper });
        await h.advanceTo(1000);
        h.submitForm();
        await h.advanceTo(serverFloor);
        assert.equal(h.calls.length, 1);
        await h.respond(0, kind);
        assert.equal(h.form.innerHTML, '', `${kind}: must not show success`);
        assert.equal(h.analytics.length, 0, `${kind}: must not emit success analytics`);
        assert.equal(h.submit.disabled, false);
        assert.equal(h.submit.innerHTML, 'Send enquiry →');
        assert.equal(h.fields.name.value, '  Test Buyer  ');
        assert.equal(h.fields.phone.value, ' 91234567 ');
        assert.equal(h.fields.email.value, ' buyer@example.test ');
        assert.equal(h.recoveries.length, 1);
        assert.equal(h.recoveries[0].leadType, 'new_launch_registration');
        assert.equal(h.recoveries[0].ctaLocation, 'project_form_recovery');
        assert.ok(h.recoveries[0].whatsappText.includes(name), 'recovery identifies the correct project');
        const retry = h.submitForm();
        h.submitForm();
        assert.equal(h.calls.length, 2, 'retry creates one new request');
        await h.respond(1);
        await retry;
        assert.ok(h.form.innerHTML.includes(successCopy));
        assert.equal(h.focused, 1);
      }
    });
  }
}
