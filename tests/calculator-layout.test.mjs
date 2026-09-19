// Calculator layout (JOE-398, UI audit step 5): inputs on the left and the
// result on the right, with the result live rather than hidden behind a button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('calculator/index.html');
const css = read('assets/decision-tools.css');
const js = read('assets/repayment-calculator.mjs');

test('both HDB loan calculator tools put the inputs and the result side by side', () => {
  for (const [panel, form, output] of [
    ['repaymentPanel', 'repaymentForm', 'repaymentOutput'],
    ['resaleCashPanel', 'resaleCashForm', 'resaleCashOutput'],
  ]) {
    const section = html.match(new RegExp(`<section class="decision-tool" id="${panel}"[\\s\\S]*?</section>`))[0];
    const layout = section.indexOf('<div class="decision-layout">');
    const inputs = section.indexOf('<div class="decision-inputs">');
    const result = section.indexOf('<div class="decision-result">');
    assert.ok(layout !== -1 && layout < inputs && inputs < section.indexOf(`<form id="${form}"`), `${panel}: form must sit in the inputs column`);
    assert.ok(result > section.indexOf('</form>') && result < section.indexOf(`id="${output}"`), `${panel}: result must sit in the result column`);
    assert.match(section.slice(result), /<p class="decision-placeholder">/, `${panel}: result column needs a placeholder for the empty state`);
  }
  assert.match(css, /@media\(min-width:900px\)\{\s*\.decision-layout\{grid-template-columns:minmax\(0,1\.05fr\) minmax\(0,1fr\)\}/);
  assert.match(css, /\.decision-result>:not\(\[hidden\]\)~\.decision-placeholder\{display:none\}/);
  assert.match(css, /#repaymentPanel \.decision-result\{position:sticky/);
});

test('the repayment result updates as you type without stealing focus', () => {
  assert.match(js, /function calculate\(trackResult = false, \{ quiet = false \} = \{\}\)/);
  assert.match(js, /if \(quiet\) return false;\s*error\.textContent = /, 'quiet runs must return before showing an error or moving focus');
  const onInput = js.match(/form\.addEventListener\('input', \(\) => \{([\s\S]*?)\}\);/)[1];
  assert.match(onInput, /liveUpdate\(\)/);
  assert.doesNotMatch(onInput, /output\.hidden = true/, 'typing must not hide a valid result');
  assert.match(js, /calculate\(false, \{ quiet: true \}\)/);
  assert.match(js, /if \(ok && !liveTracked\)/, 'the first live result is tracked once');
});

test('the calculator heroes stay compact so the inputs start high', () => {
  for (const page of ['calculator', 'stamp-duty-calculator', 'bto-calculator', 'renovation-loan-calculator']) {
    assert.ok(read(`${page}/index.html`).includes('.calc-hero{padding:36px 24px 24px;'), `${page}: hero padding`);
  }
});
