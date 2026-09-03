import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { repaymentEstimate, commissionEstimate } from '../assets/decision-calculations.mjs';

const loan = { principal: 300000, annualRatePercent: 2.6, years: 25 };
const quote = { salePrice: 600000, ratePercent: 1, gstTreatment: 'exclusive', extras: 0 };

test('repayment matches the published example and reconciles every cent', () => {
  const result = repaymentEstimate(loan);
  assert.equal(result.paymentCents, 136101);
  assert.equal(result.interestCents, 10830238);
  assert.equal(result.totalPaidCents, 40830238);
  assert.equal(result.finalPaymentCents, 136039);
  assert.equal(result.schedule.length, 25);
  assert.equal(result.schedule.at(-1).balanceCents, 0);
  assert.equal(result.schedule.reduce((sum, year) => sum + year.principalCents, 0), result.principalCents);
  assert.equal(result.schedule.reduce((sum, year) => sum + year.paidCents, 0), result.totalPaidCents);
  assert.equal(result.totalPaidCents, result.principalCents + result.interestCents);
});

test('zero interest, zero principal, short terms and tiny loans stay finite', () => {
  const zero = repaymentEstimate({ principal: 120000, annualRatePercent: 0, years: 10 });
  assert.equal(zero.paymentCents, 100000);
  assert.equal(zero.interestCents, 0);
  assert.equal(zero.totalPaidCents, 12000000);
  for (const principal of [0, 0.01, 1, 100000000]) {
    for (const annualRatePercent of [0, 0.01, 2.6, 100]) {
      for (const years of [1, 25]) {
        const result = repaymentEstimate({ principal, annualRatePercent, years });
        assert.ok(Number.isSafeInteger(result.totalPaidCents));
        assert.equal(result.totalPaidCents, result.principalCents + result.interestCents);
        assert.equal(result.schedule.at(-1).balanceCents, 0);
        assert.ok(result.schedule.every(year => year.balanceCents >= 0 && year.paidCents >= 0));
      }
    }
  }
});

test('a shorter term reduces interest, while a higher rate increases repayments', () => {
  const base = repaymentEstimate(loan);
  const short = repaymentEstimate({ ...loan, years: 15 });
  const high = repaymentEstimate({ ...loan, annualRatePercent: 4 });
  assert.ok(short.paymentCents > base.paymentCents);
  assert.ok(short.interestCents < base.interestCents);
  assert.ok(high.paymentCents > base.paymentCents);
  assert.ok(high.interestCents > base.interestCents);
});

test('invalid loan inputs are rejected instead of coerced to reassuring zero results', () => {
  for (const invalid of ['', null, undefined, NaN, Infinity, -1]) {
    assert.throws(() => repaymentEstimate({ ...loan, principal: invalid }), RangeError);
    assert.throws(() => repaymentEstimate({ ...loan, annualRatePercent: invalid }), RangeError);
    assert.throws(() => repaymentEstimate({ ...loan, years: invalid }), RangeError);
  }
  for (const years of [0, 1.5, 26]) assert.throws(() => repaymentEstimate({ ...loan, years }), RangeError);
  assert.throws(() => repaymentEstimate({ ...loan, principal: 100000001 }), RangeError);
  assert.throws(() => repaymentEstimate({ ...loan, annualRatePercent: 101 }), RangeError);
});

test('GST-exclusive commission and all-in extras do not double-tax extras', () => {
  assert.deepEqual(commissionEstimate({ ...quote, extras: 109 }), {
    feeCents: 600000, gstCents: 54000, extrasCents: 10900, totalCents: 664900,
  });
});

test('GST-inclusive quotes preserve the quoted total, and non-GST quotes add none', () => {
  const inclusive = commissionEstimate({ ...quote, ratePercent: 1.09, gstTreatment: 'inclusive' });
  assert.equal(inclusive.feeCents, 600000);
  assert.equal(inclusive.gstCents, 54000);
  assert.equal(inclusive.totalCents, 654000);
  const none = commissionEstimate({ ...quote, gstTreatment: 'none' });
  assert.equal(none.totalCents, 600000);
  assert.equal(none.gstCents, 0);
});

test('fractional commission amounts reconcile to cents in every GST mode', () => {
  for (const gstTreatment of ['none', 'inclusive', 'exclusive']) {
    const result = commissionEstimate({ salePrice: 543210.12, ratePercent: 1.23, gstTreatment, extras: 123.45 });
    assert.equal(result.totalCents, result.feeCents + result.gstCents + result.extrasCents);
    assert.ok(Object.values(result).every(Number.isSafeInteger));
  }
  assert.equal(commissionEstimate({ ...quote, ratePercent: 0 }).totalCents, 0);
});

test('invalid commission inputs and unsupported tax treatment fail closed', () => {
  for (const key of ['salePrice', 'ratePercent', 'extras']) {
    for (const invalid of ['', null, undefined, NaN, Infinity, -1]) {
      assert.throws(() => commissionEstimate({ ...quote, [key]: invalid }), RangeError);
    }
  }
  assert.throws(() => commissionEstimate({ ...quote, gstTreatment: 'unknown' }), RangeError);
  assert.throws(() => commissionEstimate({ ...quote, ratePercent: 101 }), RangeError);
  assert.throws(() => commissionEstimate({ ...quote, extras: 1000001 }), RangeError);
});

test('both public pages load the tested modules and keep inputs local and labelled', () => {
  for (const [path, module, formId] of [
    ['calculator/index.html', 'repayment-calculator', 'repaymentForm'],
    ['insights/property-agent-commission-singapore.html', 'commission-comparison', 'commissionForm'],
  ]) {
    const html = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.ok(html.includes(`<script type="module" src="/assets/${module}.mjs"></script>`));
    assert.ok(html.includes('/assets/decision-tools.css'));
    const form = html.match(new RegExp(`<form id="${formId}"[^>]*>([\\s\\S]*?)</form>`))[1];
    assert.doesNotMatch(form, /type="(?:email|tel)"|action=/);
    for (const match of form.matchAll(/<(?:input|select)[^>]*id="([^"]+)"/g)) {
      assert.ok(form.includes(`for="${match[1]}"`), `missing label for ${match[1]}`);
    }
    const js = fs.readFileSync(new URL(`../assets/${module}.mjs`, import.meta.url), 'utf8');
    assert.doesNotMatch(js, /fetch\(|localStorage|sessionStorage|sendBeacon|innerHTML/);
    assert.match(js, /output.hidden = true/);
    assert.match(js, /aria-invalid/);
  }
});

test('repayment and affordability stay separate with keyboard-accessible modes', () => {
  const html = fs.readFileSync(new URL('../calculator/index.html', import.meta.url), 'utf8');
  assert.match(html, /name="calculatorMode" value="repayment" checked/);
  assert.match(html, /name="calculatorMode" value="affordability"/);
  assert.match(html, /id="affordabilityForm" hidden/);
  assert.doesNotMatch(html, /\.calc-loan-type input\{display:none/);
  assert.match(html, /does not assess MSR, TDSR, CPF usage or loan approval/);
  assert.match(html, /not guaranteed for the whole term/);
});

test('repayment results offer privacy-safe next actions', () => {
  const html = fs.readFileSync(new URL('../calculator/index.html', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../assets/repayment-calculator.mjs', import.meta.url), 'utf8');

  assert.match(html, /id="repaymentWhatsapp"/);
  assert.match(html, /data-cta-location="calculator_repayment_result"/);
  assert.match(html, /id="repaymentBooking"/);
  assert.match(html, /id="copyRepaymentSummary"/);
  assert.match(html, /id="repaymentCopyStatus"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(js, /navigator\.clipboard\.writeText\(lastSummaryText\)/);
  assert.match(js, /calculator_result_generated/);
  assert.match(js, /calculator_result_action/);
  assert.match(js, /calculator_result_copied/);
  assert.doesNotMatch(js, /calculator_result_(?:generated|copied)'[^;]+(?:principal|annualRatePercent|years|paymentCents)/);
});
