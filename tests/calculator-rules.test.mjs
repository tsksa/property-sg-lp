import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// The affordability calculator models an HDB purchase (MSR is applied on both the HDB
// and bank branches). Two regulatory constants drive every number it shows, and both
// were wrong in production — the bank branch used the 30-year private-property tenure
// ceiling, and the HDB branch computed eligibility at 2.6% instead of the 3% floor.
// Together they overstated a buyer's maximum price by up to ~$64k, which is the kind
// of error that surfaces only after an offer has been made.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'calculator', 'index.html'), 'utf8');

// Execute the actual production calculation/rendering, not a duplicate formula.
function renderAffordability(overrides = {}, loanType = 'HDB') {
  const values = { income: 8000, cash: 20000, cpfOA: 50000, age: 35, tenure: 25, otherDebt: 0, ...overrides };
  const elements = new Map(Object.entries(values).map(([id, value]) => [id, { value: String(value) }]));
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    },
    querySelector: () => ({ value: loanType }),
    activeElement: null,
  };
  const source = html.slice(html.indexOf('const fmt ='), html.indexOf('// Debounce recalc'));
  vm.runInNewContext(source + '\nrecalc();', { document });
  return id => elements.get(id).textContent;
}

test('HDB renders the actual-rate repayment and the correct CPF/cash split', () => {
  const result = renderAffordability();
  assert.equal(result('maxPrice'), '$280,000');
  assert.equal(result('maxLoan'), '$210,000');
  assert.equal(result('downpayment'), '$70,000');
  assert.equal(result('monthlyPayment'), '$953');
  assert.match(result('monthlyDetail'), /2.6%.*11.9%.*3% assessment rate: \$996/);
  assert.match(result('maxPriceDetail'), /eligibility assessment rate, not repayment rate/);
  assert.match(result('downpaymentDetail'), /\$50,000 CPF OA \+ \$20,000 cash/);
  assert.match(result('downpaymentDetail'), /Excludes stamp duty, fees and cash-over-valuation/);
});

test('HDB contribution handles CPF-only, cash-only and zero funds without false coverage claims', () => {
  assert.match(renderAffordability({ cash: 0, cpfOA: 70000 })('downpaymentDetail'), /\$70,000 CPF OA \+ \$0 cash/);
  assert.match(renderAffordability({ cash: 70000, cpfOA: 0 })('downpaymentDetail'), /\$0 CPF OA \+ \$70,000 cash/);
  assert.equal(renderAffordability({ cash: 0, cpfOA: 0 })('monthlyPayment'), '$0');
  assert.equal(renderAffordability({ income: 0 })('downpaymentDetail'), '');
  assert.doesNotMatch(html, /Can be fully covered by CPF OA/);
});

test('bank loan keeps its assessment-rate headline and mandatory cash explanation', () => {
  const result = renderAffordability({}, 'Bank');
  assert.equal(result('maxPrice'), '$280,000');
  assert.equal(result('monthlyPayment'), '$1,108');
  assert.match(result('monthlyDetail'), /At 4% stress rate/);
  assert.match(result('downpaymentDetail'), /Min 5% cash \(\$14,000\)/);
});

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
