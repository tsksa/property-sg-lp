// Block sale alerts (JOE-403, UI audit step 6): one shared card, offered
// wherever a visitor has just looked a block up, posting to the existing
// subscribe-alert function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const js = read('assets/block-alert.js');
const css = read('assets/block-alert.css');
const PAGES = ['index.html', 'valuation.html', 'neighbour-prices/index.html'];

test('the card is on every page that can look up a block', () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /<script src="\/assets\/block-alert\.js"( defer)?><\/script>/, `${page}: component script`);
    assert.match(html, /<link rel="stylesheet" href="\/assets\/block-alert\.css">/, `${page}: component styles`);
  }
});

test('there is one implementation: neighbour-prices mounts the shared card', () => {
  const np = read('neighbour-prices/index.html');
  assert.match(np, /<div id="npAlert" hidden><\/div>/, 'the page should hold an empty host, not its own card markup');
  assert.match(np, /window\.jtBlockAlert\.mount\(alertHost, \{/);
  assert.doesNotMatch(np, /np-alert/, 'the old inline card and its styles should be gone');
  assert.doesNotMatch(np, /subscribe-alert/, 'the page should not post to the endpoint itself any more');
});

test('the estimate widget offers the alert, with the looked-up block', () => {
  const widget = read('assets/block-estimate.js');
  assert.match(widget, /text: 'Tell me when the next flat sells'/);
  assert.match(widget, /window\.jtBlockAlert\.mount\(alertHost, \{ postal_code: postal, block: addr\.block, street_name: addr\.road, town \}/);
  // No component on the page means no button, rather than a button that fails.
  assert.match(widget, /const alertBtn = window\.jtBlockAlert \?/);
  assert.match(widget, /'aria-expanded': 'false', 'aria-controls': `\$\{idPrefix\}-alert`/);
});

test('the card posts to the existing endpoint and nowhere else', () => {
  const urls = [...js.matchAll(/fetch\(\s*([A-Za-z_$][\w$]*|'[^']*')/g)].map((m) => m[1]);
  assert.deepEqual(urls, ['ENDPOINT']);
  assert.match(js, /var ENDPOINT = '\/api\/subscribe-alert';/);
  assert.doesNotMatch(js, /https?:\/\//, 'the card must not call any third party');
});

test('name, contact and consent are all required before anything is sent', () => {
  for (const message of [
    'Please enter your name.',
    'Please enter your mobile number or email.',
    'Please tick the consent box so Joe can contact you.',
  ]) assert.ok(js.includes(message), `missing check: ${message}`);
  const submit = js.slice(js.indexOf("form.addEventListener('submit'"));
  assert.ok(submit.indexOf('fail(\'Please tick the consent box') < submit.indexOf('fetch(ENDPOINT'), 'consent is checked before the post');
  assert.match(js, /consent: true/);
  assert.match(js, /name: 'company_website'/, 'keep the honeypot');
  assert.match(js, /company_website: honeypot\.value/);
});

test('the card tells the visitor Joe contacts them, and stays personal', () => {
  assert.match(js, /I agree to be contacted by Joe Tay about resale activity for this block\. One person sees this — no lists, no newsletters\./);
  assert.match(js, /Joe will message you the price/);
  assert.match(js, /the DIGEST GOES TO JOE|nothing is ever sent to the subscriber automatically/i);
});

test('analytics never carry the name or contact', () => {
  const calls = [...js.matchAll(/track\('([a-z_]+)',\s*\{([^}]*)\}\)/g)];
  assert.ok(calls.length >= 2, 'expected the view and subscribe events');
  for (const [, event, params] of calls) {
    assert.doesNotMatch(params, /name|contact|email|postal|street/i, `${event} sends a personal field: {${params}}`);
  }
  assert.match(js, /if \(typeof window\.gtag === 'function'\)/);
});

test('the card is built as nodes, never from a string of markup', () => {
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.match(js, /throw new Error\('block-alert: markup is built as nodes, never from strings'\)/);
});

test('the card styles cover dark mode and narrow screens', () => {
  assert.match(css, /html\.jt-theme-dark \.jt-ba\{/);
  assert.match(css, /@media\(max-width:520px\)\{\.jt-ba-row\{grid-template-columns:1fr\}/);
  assert.match(css, /\.jt-ba-hp\{position:absolute;left:-9999px\}/, 'the honeypot stays off screen');
});

test('subscriptions still go only to Joe', () => {
  const fn = read('netlify/functions/alert-digest.js');
  assert.match(fn, /sends ONE digest to Joe|no automated outbound to subscribers/i);
  assert.doesNotMatch(read('assets/block-alert.js'), /unsubscribe/i, 'no mailing list is implied');
});
