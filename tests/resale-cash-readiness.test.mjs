import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { resaleCashReadiness } from '../assets/resale-cash-readiness.mjs';

const example = { price: 280000, valuation: 280000, loan: 210000, cpf: 50000, deposit: 0, cash: 20000, reserve: 3800 };

test('purchase funds reconcile and stamp-duty reserve exposes the shortfall', () => {
  const r = resaleCashReadiness(example);
  assert.equal(r.cashForPrice, 2000000);
  assert.equal(r.cashRequired, 2380000);
  assert.equal(r.shortfall, 380000);
  assert.equal(r.price, r.loan + r.deposit + r.cpfApplied + r.cashForPrice);
});

test('paid deposit reduces both cash on hand and remaining price exactly once', () => {
  const before = resaleCashReadiness(example);
  const after = resaleCashReadiness({ ...example, deposit: 5000, cash: 15000 });
  assert.equal(after.shortfall, before.shortfall);
  assert.equal(after.cashForPrice, before.cashForPrice - 500000);
});

test('COV is cash-only even with excess CPF and is not added a second time', () => {
  const r = resaleCashReadiness({ ...example, price: 300000, valuation: 280000, cpf: 100000, deposit: 5000, reserve: 0 });
  assert.equal(r.cov, 2000000);
  assert.equal(r.cpfApplied, 7000000);
  assert.equal(r.cashForPrice, 1500000);
  assert.equal(r.cashRequired, 1500000);
  assert.equal(r.unusedCpf, 3000000);
});

test('deposit larger than COV does not create negative cash or CPF amounts', () => {
  const r = resaleCashReadiness({ ...example, price: 282000, cpf: 100000, deposit: 5000, reserve: 0 });
  assert.equal(r.cashForPrice, 0);
  assert.equal(r.cpfApplied, 6700000);
});

test('valuation above price, no loan, no CPF, and exact-funding cases', () => {
  const r = resaleCashReadiness({ ...example, valuation: 300000, loan: 0, cpf: 0, cash: 283800 });
  assert.equal(r.cov, 0);
  assert.equal(r.shortfall, 0);
  assert.equal(r.cashRemaining, 0);
  assert.equal(resaleCashReadiness({ ...example, cpf: 30000 }).shortfall, 2380000);
});

test('confirmed smaller loan is honoured without recalculating eligibility', () => {
  assert.equal(resaleCashReadiness({ ...example, loan: 180000 }).cashForPrice, 5000000);
});

test('invalid, blank, non-finite and contradictory inputs fail closed', () => {
  for (const value of [-1, NaN, Infinity, '', null, 100000001]) {
    assert.throws(() => resaleCashReadiness({ ...example, cash: value }), RangeError);
  }
  for (const change of [{ price: 0 }, { valuation: 0 }, { loan: 280001 }, { deposit: 5001 }, { loan: 280000, deposit: 1 }]) {
    assert.throws(() => resaleCashReadiness({ ...example, ...change }), RangeError);
  }
});

test('fractional dollars reconcile in integer cents', () => {
  const r = resaleCashReadiness({ ...example, price: 280000.12, valuation: 280000.12, deposit: 1000.01, reserve: 3800.25 });
  assert.equal(r.price, r.loan + r.deposit + r.cpfApplied + r.cashForPrice);
  assert.equal(r.cashRequired, r.cashForPrice + r.reserve);
});

test('UI requires explicit amounts and hides stale results when inputs change', () => {
  const html = fs.readFileSync(new URL('../calculator/index.html', import.meta.url), 'utf8');
  const ui = fs.readFileSync(new URL('../assets/resale-cash-readiness-ui.mjs', import.meta.url), 'utf8');
  for (const key of Object.keys(example)) {
    assert.match(html, new RegExp('label for="resaleInput-' + key + '"'));
    assert.match(html, new RegExp('id="resaleInput-' + key + '"[^>]*required'));
  }
  assert.match(html, /id="resaleCashOutput"[^>]*role="status"[^>]*hidden/);
  assert.match(ui, /addEventListener\('input',[\s\S]*?output.hidden = true/);
  assert.match(ui, /invalid.focus\(\)/);
  assert.match(html, /id="resaleCashSubmit" disabled/);
  assert.doesNotMatch(ui, /fetch\(|localStorage|gtag\(/);
});
