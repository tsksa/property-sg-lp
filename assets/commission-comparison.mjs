import { commissionEstimate } from './decision-calculations.mjs';

const money = cents => 'S$' + (cents / 100).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const form = document.getElementById('commissionForm');
const output = document.getElementById('commissionOutput');
const error = document.getElementById('commissionError');
const fields = [...form.querySelectorAll('input')];
form.addEventListener('input', () => {
  output.hidden = true;
  error.textContent = '';
  fields.forEach(field => field.removeAttribute('aria-invalid'));
});
form.addEventListener('change', () => { output.hidden = true; });
form.addEventListener('submit', event => {
  event.preventDefault();
  fields.forEach(field => field.removeAttribute('aria-invalid'));
  const invalid = fields.find(field => !field.validity.valid || field.value.trim() === '' || !Number.isFinite(field.valueAsNumber));
  if (invalid) {
    output.hidden = true;
    error.textContent = 'Enter a sale price from S$0 to S$100,000,000, commission rates from 0% to 100%, and all-in extras from S$0 to S$1,000,000.';
    invalid.setAttribute('aria-invalid', 'true');
    invalid.focus();
    return;
  }
  error.textContent = '';
  const salePrice = document.getElementById('commissionPrice').valueAsNumber;
  const results = ['A', 'B'].map(quote => {
    const result = commissionEstimate({
      salePrice,
      ratePercent: document.getElementById(`commissionRate${quote}`).valueAsNumber,
      gstTreatment: document.getElementById(`commissionGst${quote}`).value,
      extras: document.getElementById(`commissionExtras${quote}`).valueAsNumber,
    });
    for (const [field, key] of [['Fee', 'feeCents'], ['Tax', 'gstCents'], ['ExtrasTotal', 'extrasCents'], ['Total', 'totalCents']]) {
      document.getElementById(`commission${field}${quote}`).textContent = money(result[key]);
    }
    return result;
  });
  const difference = results[0].totalCents - results[1].totalCents;
  document.getElementById('commissionDifference').textContent = difference === 0
    ? 'Both estimates have the same total cost. Compare the agreed services and exclusions.'
    : `Quote ${difference < 0 ? 'A' : 'B'} costs ${money(Math.abs(difference))} less on these inputs. A lower cost does not establish better service or value.`;
  output.hidden = false;
});
