import { repaymentEstimate } from './decision-calculations.mjs';

const money = cents => 'S$' + (cents / 100).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const form = document.getElementById('repaymentForm');
const output = document.getElementById('repaymentOutput');
const error = document.getElementById('repaymentError');
const fields = [...form.querySelectorAll('input')];

function calculate() {
  fields.forEach(field => field.removeAttribute('aria-invalid'));
  const invalid = fields.find(field => !field.validity.valid || field.value.trim() === '' || !Number.isFinite(field.valueAsNumber));
  if (invalid) {
    output.hidden = true;
    error.textContent = 'Enter a loan amount from S$0 to S$100,000,000, a rate from 0% to 100%, and a whole-number term from 1 to 25 years.';
    invalid.setAttribute('aria-invalid', 'true');
    invalid.focus();
    return;
  }
  const result = repaymentEstimate({
    principal: document.getElementById('repaymentPrincipal').valueAsNumber,
    annualRatePercent: document.getElementById('repaymentRate').valueAsNumber,
    years: document.getElementById('repaymentYears').valueAsNumber,
  });
  error.textContent = '';
  document.getElementById('repaymentMonthly').textContent = money(result.paymentCents);
  document.getElementById('repaymentInterest').textContent = money(result.interestCents);
  document.getElementById('repaymentTotal').textContent = money(result.totalPaidCents);
  document.getElementById('repaymentFinal').textContent = money(result.finalPaymentCents);
  const body = document.getElementById('repaymentSchedule');
  body.replaceChildren(...result.schedule.map(year => {
    const row = document.createElement('tr');
    [String(year.year), money(year.paidCents), money(year.interestCents), money(year.balanceCents)].forEach((value, index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = value;
      row.append(cell);
    });
    return row;
  }));
  output.hidden = false;
}

form.addEventListener('submit', event => { event.preventDefault(); calculate(); });
form.addEventListener('input', () => {
  output.hidden = true;
  error.textContent = '';
  fields.forEach(field => field.removeAttribute('aria-invalid'));
});
document.getElementById('useHdbRate').addEventListener('click', () => {
  document.getElementById('repaymentRate').value = '2.6';
  document.getElementById('repaymentRate').removeAttribute('aria-invalid');
  output.hidden = true;
  error.textContent = '';
});

const modes = document.getElementById('calculatorModes');
function changeMode() {
  const repayment = document.querySelector('[name="calculatorMode"]:checked').value === 'repayment';
  document.getElementById('repaymentPanel').hidden = !repayment;
  for (const id of ['affordabilityForm', 'affordabilityResults', 'affordabilityDisclaimer']) document.getElementById(id).hidden = repayment;
}
modes.addEventListener('change', changeMode);
modes.hidden = false;
changeMode();
calculate();
