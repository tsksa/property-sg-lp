import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The affordability calculator models an HDB purchase (MSR is applied on both the HDB
// and bank branches). Two regulatory constants drive every number it shows, and both
// were wrong in production — the bank branch used the 30-year private-property tenure
// ceiling, and the HDB branch computed eligibility at 2.6% instead of the 3% floor.
// Together they overstated a buyer's maximum price by up to ~$64k, which is the kind
// of error that surfaces only after an offer has been made.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'calculator', 'index.html'), 'utf8');

const amortisedLoan = (monthlyPayment, annualRate, years) => {
  const r = annualRate / 12;
  const n = years * 12;
  return monthlyPayment * (1 - (1 + r) ** -n) / r;
};

test('tenure is capped at the 25-year HDB ceiling, not the private 30-year one', () => {
  assert.doesNotMatch(html, /Math\.min\(30,/, 'a 30-year tenure cap is back in the calculator');
  assert.match(html, /const maxTenure = Math\.min\(25, ageCapTenure\)/);
  assert.match(html, /id="tenure"[^>]*max="25"/, 'tenure input still allows more than 25 years');
});

test('HDB eligibility uses the 3% floor while the displayed payment stays at 2.6%', () => {
  assert.match(html, /const annualRate = loanType === 'HDB' \? Math\.max\(0\.03, 0\.026\)/);
  assert.match(html, /const marketRate = loanType === 'HDB' \? 0\.026/);
});

test('the corrected constants produce the expected maximum price', () => {
  // $8,000 income, age 30, no other debt: MSR 30% binds on HDB, TDSR 55% is looser.
  const income = 8000;
  const msrMonthly = income * 0.3;
  const ltv = 0.75;

  const bankPrice = amortisedLoan(msrMonthly, 0.04, 25) / ltv;
  const hdbPrice = amortisedLoan(msrMonthly, 0.03, 25) / ltv;

  assert.equal(Math.round(bankPrice), 606248);
  assert.equal(Math.round(hdbPrice), 674805);

  // Guard the direction of the fix: the old inputs must yield a higher, wrong number.
  assert.ok(amortisedLoan(msrMonthly, 0.04, 30) / ltv > bankPrice);
  assert.ok(amortisedLoan(msrMonthly, 0.026, 25) / ltv > hdbPrice);
});
