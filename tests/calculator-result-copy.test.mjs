import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { attachResultCopy } from '../assets/calculator-result-copy.mjs';

function element(values = {}) {
  const listeners = {};
  return { listeners, value: '100', valueAsNumber: 100, type: 'number', validity: {}, textContent: '',
    addEventListener(name, fn) { listeners[name] = fn; }, focus() { this.focused = true; }, ...values };
}
function setup(overrides = {}) {
  const button = element({ type: 'button', hidden: true });
  const status = element();
  const fields = [element()];
  const copied = [], events = [];
  attachResultCopy({ button, status, fields, calculator: 'bto',
    buildSummary: () => `Estimate ${fields[0].value}`,
    clipboard: { writeText: async text => copied.push(text) },
    track: (...args) => events.push(args), ...overrides });
  return { button, status, fields, copied, events, click: button.listeners.click };
}
test('copies fresh values and sends only a calculator identifier to analytics', async () => {
  const h = setup();
  h.fields[0].value = '987654';
  await h.click();
  assert.deepEqual(h.copied, ['Estimate 987654']);
  assert.deepEqual(h.events, [['calculator_result_copied', { calculator: 'bto' }]]);
  assert.match(h.status.textContent, /Result copied/);
  assert.equal(h.button.hidden, false);
  h.fields[0].listeners.input();
  assert.equal(h.status.textContent, '');
});
test('empty, non-finite and out-of-range inputs cannot be copied', async () => {
  for (const values of [{ value: '' }, { valueAsNumber: NaN }, { validity: { rangeUnderflow: true } }, { validity: { rangeOverflow: true } }]) {
    const h = setup(); Object.assign(h.fields[0], values);
    await h.click();
    assert.equal(h.copied.length, 0);
    assert.equal(h.fields[0].focused, true);
    assert.equal(h.events.length, 0);
  }
});
test('empty estimate cannot be copied', async () => {
  const h = setup({ buildSummary: () => '' });
  await h.click(); assert.equal(h.copied.length, 0);
  assert.match(h.status.textContent, /produce an estimate/);
});
test('denied or unavailable clipboard gives a recoverable error without tracking', async () => {
  for (const clipboard of [null, { writeText: async () => { throw new Error('denied'); } }]) {
    const h = setup({ clipboard }); await h.click();
    assert.match(h.status.textContent, /Could not copy/);
    assert.equal(h.events.length, 0);
    assert.equal(h.button.disabled, false);
  }
});
test('editing during clipboard write cannot announce an obsolete result as current', async () => {
  let finish;
  const h = setup({ clipboard: { writeText: () => new Promise(resolve => { finish = resolve; }) } });
  const pending = h.click();
  assert.equal(h.button.disabled, true);
  h.fields[0].listeners.change(); finish(); await pending;
  assert.equal(h.status.textContent, '');
  assert.equal(h.button.disabled, false);
});
test('analytics failure does not change clipboard success', async () => {
  const h = setup({ track: () => { throw new Error('offline'); } });
  await h.click(); assert.match(h.status.textContent, /Result copied/);
});

for (const page of ['bto-calculator', 'stamp-duty-calculator']) {
  test(`${page} wires accessible copy controls and recalculates the actual summary`, () => {
    const html = fs.readFileSync(new URL(`../${page}/index.html`, import.meta.url), 'utf8');
    assert.match(html, /id="copyResult"[^>]*hidden>Copy result/);
    assert.match(html, /id="copyResultStatus"[^>]*role="status"[^>]*aria-live="polite"/);
    const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
      .replace(/import \{ attachResultCopy \} from '[^']+';/, '');
    const nodes = new Map();
    const defaults = { income: '7000', savings: '60000', age: '30', flatType: '2000', price: '1000000', profile: 'SC' };
    const get = id => {
      if (!nodes.has(id)) nodes.set(id, element({ value: defaults[id] || '', checked: true, classList: { toggle() {} } }));
      return nodes.get(id);
    };
    let config;
    const countInputs = [element(), element(), element()];
    const document = { getElementById: get, querySelector: selector => ({ value: selector.includes('loanType') ? 'HDB' : '1' }), querySelectorAll: selector => selector === '[name="count"]' ? countInputs : [] };
    vm.runInNewContext(code, { document, attachResultCopy: c => { config = c; }, setTimeout, clearTimeout });
    const summary = config.buildSummary();
    assert.match(summary, /Planning estimate only/);
    assert.match(summary, new RegExp(`https://joetay.com/${page}/`));
    if (page === 'stamp-duty-calculator') {
      assert.match(summary, /BSD: \$24,600/);
      get('price').value = '2000000';
      assert.match(config.buildSummary(), /BSD: \$69,600/);
      get('profile').value = 'FR';
      assert.match(config.buildSummary(), /not applicable to the flat ABSD rate/);
      assert.ok(countInputs.every(input => input.disabled));
      get('profile').value = 'EN';
      config.buildSummary();
      assert.ok(countInputs.every(input => input.disabled));
      for (const profile of ['SC', 'PR']) {
        get('profile').value = profile;
        config.buildSummary();
        assert.ok(countInputs.every(input => !input.disabled));
      }
    } else {
      assert.ok(summary.includes(get('maxBudget').textContent));
      get('income').value = '0';
      assert.equal(config.buildSummary(), '');
    }
  });
}
