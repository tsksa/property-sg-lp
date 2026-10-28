import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function serverFloor() {
  const server = read('netlify/functions/submit-lead.js');
  const match = server.match(/tOnForm\s*<\s*(\d+)/);
  assert.ok(match, 'could not find the server time-on-form floor');
  return Number(match[1]);
}

for (const page of ['sell/index.html', 'sell-hdb/singapore/index.html', 'rent-out/index.html']) {
  test(`${page} never submits before submit-lead.js's time-on-form floor`, () => {
    const html = read(page);
    const match = html.match(/jtWaitForSpamFloor\(form,\s*_pageLoadedAt,\s*(\d+)/);
    assert.ok(match, `${page} has no queued client-side time-on-form gate`);
    assert.ok(
      Number(match[1]) >= serverFloor(),
      `${page} allows submission at ${match[1]}ms, before the server accepts it`,
    );
  });
}

for (const formId of ['rentForm', 'rentFormFinal']) {
  test(`rent-out ${formId} keeps required fields visibly labelled and privacy accessible`, () => {
    const html = read('rent-out/index.html');
    const form = html.match(new RegExp(`<form id="${formId}"[\\s\\S]*?</form>`))?.[0];
    assert.ok(form, `missing ${formId}`);
    for (const name of ['name', 'phone', 'propType']) {
      const field = form.match(new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`))?.[0];
      assert.ok(field, `missing ${name}`);
      const id = field.match(/id="([^"]+)"/)?.[1];
      assert.ok(id, `${name} needs a stable label target`);
      assert.match(form, new RegExp(`<label for="${id}">[^<]+</label>`));
      assert.equal(html.split(`id="${id}"`).length - 1, 1, 'label target must be unique across both forms');
      assert.match(field, /\brequired\b/);
    }
    assert.match(form, /class="lp-form-micro"[\s\S]*href="\/privacy-policy.html"/);
    assert.match(form, /name="newsletter_opt_in"/);
    assert.doesNotMatch(form.match(/<input[^>]*name="newsletter_opt_in"[^>]*>/)[0], /\bchecked\b/);
  });
}

test('rent-out floating controls stay clear until both enquiry cards leave the viewport', () => {
  const script = read('rent-out/index.html').match(/<script id="rent-enquiry-controls">([\s\S]*?)<\/script>/)[1];
  const cards = [{}, {}];
  const observed = [];
  let callback;
  let hidden;
  const document = {
    body: { classList: { toggle(name, value) { assert.equal(name, 'lp-enquiry-visible'); hidden = value; } } },
    querySelectorAll(selector) { assert.equal(selector, '.lp-form-card'); return cards; },
  };
  class IntersectionObserver {
    constructor(fn) { callback = fn; }
    observe(card) { observed.push(card); }
  }
  vm.runInNewContext(script, { window: { IntersectionObserver }, IntersectionObserver, document });
  assert.deepEqual(observed, cards);
  callback([{ target: cards[0], isIntersecting: true }]);
  assert.equal(hidden, true);
  callback([{ target: cards[1], isIntersecting: true }, { target: cards[0], isIntersecting: false }]);
  assert.equal(hidden, true);
  callback([{ target: cards[1], isIntersecting: false }]);
  assert.equal(hidden, false);
  assert.doesNotThrow(() => vm.runInNewContext(script, { window: {} }));
});
