import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Guards the renovation-loan calculator's regulatory constants and its one
// honesty rule: the cap and tenure are hard facts (the major banks' published
// terms), but the INTEREST RATE must stay a user input — a hard-coded bank
// rate goes stale silently and misleads a live borrower.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'renovation-loan-calculator', 'index.html'), 'utf8');

test('the cap is min($30,000, 6× monthly income) and tenure tops out at 5 years', () => {
  assert.match(html, /const RENO_CAP = 30000/);
  assert.match(html, /const RENO_INCOME_MULTIPLE = 6/);
  assert.match(html, /const RENO_MAX_TENURE_YEARS = 5/);
  assert.match(html, /Math\.min\(RENO_CAP, RENO_INCOME_MULTIPLE \* income\)/);
});

test('the interest rate is a user input, not a hard-coded bank rate', () => {
  assert.match(html, /<input type="number" id="rate"/);
  assert.match(html, /parseFloat\(document\.getElementById\('rate'\)\.value\)/);
  // The illustrative default must be labelled as such where the user sees it.
  assert.match(html, /illustrative default, check your bank/);
});

test('flat-rate instalment maths is correct', () => {
  // Mirrors the page: monthly = (P + P*r*t) / (t*12)
  const monthly = (P, r, t) => (P + P * r * t) / (t * 12);
  assert.equal(monthly(30000, 0.045, 5), 612.5);
  assert.equal(monthly(24000, 0.045, 5), 490);
  assert.match(html, /\(principal \+ principal \* flatAnnualRate \* years\) \/ months/);
});

test('the income cap binds before the $30k ceiling for lower incomes', () => {
  const eligible = (income, requested) => Math.max(0, Math.min(requested, Math.min(30000, 6 * income)));
  assert.equal(eligible(4000, 30000), 24000);
  assert.equal(eligible(5000, 30000), 30000);
  assert.equal(eligible(10000, 20000), 20000);
  assert.equal(eligible(0, 30000), 0);
});

test('the page is honest about flat rate vs effective rate', () => {
  assert.match(html, /effective interest rate \(EIR\)/i);
  assert.match(html, /your bank's EIR will be higher/);
});

test('every FAQPage answer is rendered visibly on the page, verbatim', () => {
  const faq = JSON.parse(
    [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)]
      .map((m) => m[1]).find((j) => j.includes('"FAQPage"')),
  );
  const body = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  for (const q of faq.mainEntity) {
    assert.ok(body.includes(`<summary>${q.name}</summary>`), `question not visible: ${q.name}`);
    assert.ok(body.includes(`<p>${q.acceptedAnswer.text}</p>`), `answer not visible: ${q.name}`);
  }
});

test('mobile inputs are 16px so iOS does not zoom on focus', () => {
  assert.match(html, /@media\(max-width:768px\)\{\.calc-field input,\.calc-field select\{font-size:16px\}\}/);
});
