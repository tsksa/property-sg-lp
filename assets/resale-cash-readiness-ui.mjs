import { resaleCashReadiness } from './resale-cash-readiness.mjs';

const form = document.getElementById('resaleCashForm');
const output = document.getElementById('resaleCashOutput');
const error = document.getElementById('resaleCashError');
const fields = [...form.querySelectorAll('input')];
const money = cents => 'S$' + (cents / 100).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const copyButton = document.getElementById('copyResaleCashSummary');
const copyStatus = document.getElementById('resaleCashCopyStatus');
const booking = document.getElementById('resaleCashBooking');
let lastSummaryText = '';
let resultRevision = 0;

function resetResultActions() {
  resultRevision += 1;
  lastSummaryText = '';
  if (copyStatus) {
    copyStatus.hidden = true;
    copyStatus.textContent = '';
  }
}

// Fail closed if the calculation module cannot load: never submit these amounts.
form.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('input', () => {
  output.hidden = true;
  error.textContent = 'Inputs changed. Calculate again to update the breakdown.';
  fields.forEach(field => field.removeAttribute('aria-invalid'));
  resetResultActions();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  output.hidden = true;
  fields.forEach(field => field.removeAttribute('aria-invalid'));
  const invalid = fields.find(field => !field.validity.valid || field.value.trim() === '');
  if (invalid) {
    error.textContent = 'Complete every amount with a valid number. Use 0 only where nothing is payable or available.';
    invalid.setAttribute('aria-invalid', 'true');
    invalid.focus();
    return;
  }
  try {
    const result = resaleCashReadiness(Object.fromEntries(fields.map(field => [field.name, field.valueAsNumber])));
    for (const [key, value] of Object.entries(result)) {
      const target = document.getElementById('resale-' + key);
      if (target) target.textContent = money(value);
    }
    document.getElementById('resaleCashStatus').textContent = result.shortfall > 0
      ? `Additional cash needed: ${money(result.shortfall)}`
      : 'No cash shortfall for the amounts entered — not a loan or purchase approval.';
    lastSummaryText = [
      'Joe Tay resale cash-readiness estimate',
      `Purchase price: ${money(result.price)}`,
      `Confirmed loan: ${money(result.loan)}`,
      `Deposit already paid: ${money(result.deposit)}`,
      `CPF applied: ${money(result.cpfApplied)}`,
      `Cash needed from now: ${money(result.cashRequired)}`,
      `Additional cash shortfall: ${money(result.shortfall)}`,
      'Planning estimate only. Confirm the financing, CPF allocation, grants, costs and payment dates with HDB, your lender or solicitor.'
    ].join('\n');
    error.textContent = '';
    output.hidden = false;
    if (typeof window.jtTrackConversion === 'function') {
      window.jtTrackConversion('calculator_result_generated', { calculator: 'resale_cash_readiness' });
    }
  } catch (cause) {
    error.textContent = cause.message;
    error.focus();
  }
});

copyButton?.addEventListener('click', async () => {
  if (!lastSummaryText) return;
  const copiedRevision = resultRevision;
  const summary = lastSummaryText;
  copyButton.disabled = true;
  try {
    await navigator.clipboard.writeText(summary);
  } catch {
    if (resultRevision === copiedRevision) {
      copyStatus.textContent = 'Could not copy automatically. Please try again.';
      copyStatus.hidden = false;
    }
    return;
  } finally {
    copyButton.disabled = false;
  }
  if (resultRevision !== copiedRevision) return;
  copyStatus.textContent = 'Private result copied. You decide where to paste it.';
  copyStatus.hidden = false;
  try {
    window.jtTrackConversion?.('calculator_result_copied', { calculator: 'resale_cash_readiness' });
  } catch {
    // Analytics must not change the copy result.
  }
});

booking?.addEventListener('click', () => {
  if (typeof window.jtTrackConversion === 'function') {
    window.jtTrackConversion('calculator_result_action', { calculator: 'resale_cash_readiness', action: 'book_call' });
  }
});

document.getElementById('resaleCashSubmit').disabled = false;
