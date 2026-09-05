import { resaleCashReadiness } from './resale-cash-readiness.mjs';

const form = document.getElementById('resaleCashForm');
const output = document.getElementById('resaleCashOutput');
const error = document.getElementById('resaleCashError');
const fields = [...form.querySelectorAll('input')];
const money = cents => 'S$' + (cents / 100).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
document.getElementById('resaleCashSubmit').disabled = false;
