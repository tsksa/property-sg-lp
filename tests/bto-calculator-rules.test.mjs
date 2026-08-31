import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The BTO calculator deliberately mirrors /calculator/'s tested loan rules
// rather than importing them — this repo is build-less and the affordability
// calculator's own tests pin its INLINE source, so a physical extraction would
// have rewritten that regression net. These tests do two jobs instead:
//   1. pin the BTO page's own regulatory constants, and
//   2. assert the two pages' shared rules are byte-identical (drift guard),
//      so a rule change on one page cannot silently strand the other.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'bto-calculator', 'index.html'), 'utf8');
const resaleHtml = fs.readFileSync(path.join(ROOT, 'calculator', 'index.html'), 'utf8');

const amortisedLoan = (monthlyPayment, annualRate, years) => {
  const r = annualRate / 12;
  const n = years * 12;
  return monthlyPayment * (1 - (1 + r) ** -n) / r;
};

test('tenure is capped at the 25-year HDB ceiling and by age 65', () => {
  assert.match(html, /const tenure = Math\.min\(25, ageCapTenure\)/);
  assert.match(html, /const ageCapTenure = Math\.max\(5, 65 - age\)/);
  assert.doesNotMatch(html, /Math\.min\(30,/, 'the private 30-year ceiling has crept in');
});

test('HDB eligibility uses the 3% floor while the displayed payment stays at 2.6%', () => {
  assert.match(html, /const annualRate = loanType === 'HDB' \? Math\.max\(0\.03, 0\.026\) : 0\.040/);
  assert.match(html, /const marketRate = loanType === 'HDB' \? 0\.026 : 0\.025/);
});

test('shared loan rules are byte-identical with the resale calculator (drift guard)', () => {
  for (const rule of [
    /const annualRate = loanType === 'HDB' \? Math\.max\(0\.03, 0\.026\) : 0\.040/,
    /const marketRate = loanType === 'HDB' \? 0\.026 : 0\.025/,
    /const msrMax = income \* 0\.30/,
    /const ltv = 0\.75/,
  ]) {
    const inBto = html.match(rule)?.[0];
    const inResale = resaleHtml.match(rule)?.[0];
    assert.ok(inBto, `BTO page lost rule ${rule}`);
    assert.ok(inResale, `resale calculator lost rule ${rule} — update BOTH pages together`);
    assert.equal(inBto, inResale);
  }
});

test('budget maths: downpayment-bound and loan-bound regimes both correct', () => {
  // Mirrors the page's formula: maxPrice = min(maxLoan + savings, savings / 0.25)
  const income = 7000, savings = 60000;
  const maxLoan = amortisedLoan(income * 0.30, 0.03, 25);
  const maxPrice = Math.min(maxLoan + savings, savings / 0.25);
  assert.equal(maxPrice, 240000, 'with $60k savings the 25% downpayment must bind at $240k');
  assert.match(html, /Math\.min\(maxLoan \+ savings, savings \/ \(1 - ltv\)\)/);

  // savings-rich: the loan binds instead, and the buyer over-downpays legally
  const richPrice = Math.min(maxLoan + 400000, 400000 / 0.25);
  assert.ok(Math.abs(richPrice - (maxLoan + 400000)) < 1e-6);
});

test('option fees match the published HDB schedule', () => {
  assert.match(html, /<option value="500">2-room Flexi<\/option>/);
  assert.match(html, /<option value="1000">3-room<\/option>/);
  assert.match(html, /<option value="2000" selected>4-room<\/option>/);
  assert.match(html, /\$500 for a 2-room Flexi flat, \$1,000 for a 3-room flat, and \$2,000 for a 4-room/);
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
