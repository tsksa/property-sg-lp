import { repaymentEstimate } from './decision-calculations.mjs';

const money = cents => 'S$' + (cents / 100).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const form = document.getElementById('repaymentForm');
const output = document.getElementById('repaymentOutput');
const error = document.getElementById('repaymentError');
const fields = [...form.querySelectorAll('input')];
const whatsapp = document.getElementById('repaymentWhatsapp');
const booking = document.getElementById('repaymentBooking');
const copyButton = document.getElementById('copyRepaymentSummary');
const copyStatus = document.getElementById('repaymentCopyStatus');
let lastSummaryText = '';

function resetResultActions() {
  lastSummaryText = '';
  if (whatsapp) whatsapp.href = 'https://wa.me/6581881488';
  if (copyStatus) {
    copyStatus.hidden = true;
    copyStatus.textContent = '';
  }
}

function calculate(trackResult = false) {
  fields.forEach(field => field.removeAttribute('aria-invalid'));
  const invalid = fields.find(field => !field.validity.valid || field.value.trim() === '' || !Number.isFinite(field.valueAsNumber));
  if (invalid) {
    output.hidden = true;
    error.textContent = 'Enter a loan amount from S$0 to S$100,000,000, a rate from 0% to 100%, and a whole-number term from 1 to 25 years.';
    invalid.setAttribute('aria-invalid', 'true');
    invalid.focus();
    return;
  }
  const principal = document.getElementById('repaymentPrincipal').valueAsNumber;
  const annualRatePercent = document.getElementById('repaymentRate').valueAsNumber;
  const years = document.getElementById('repaymentYears').valueAsNumber;
  const result = repaymentEstimate({ principal, annualRatePercent, years });
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
  lastSummaryText = [
    'Joe Tay HDB loan calculator estimate',
    `Loan amount: ${money(Math.round(principal * 100))}`,
    `Loan term: ${years} years`,
    `Interest rate: ${annualRatePercent}% p.a.`,
    `Estimated monthly repayment: ${money(result.paymentCents)}`,
    `Estimated total interest: ${money(result.interestCents)}`,
    'Planning estimate only. Your lender or HFE letter determines the actual approved amount.',
  ].join('\n');
  if (whatsapp) {
    const message = `${lastSummaryText}\n\nHi Joe, can you help me review this estimate?`;
    whatsapp.href = `https://wa.me/6581881488?text=${encodeURIComponent(message)}`;
  }
  if (copyStatus) {
    copyStatus.hidden = true;
    copyStatus.textContent = '';
  }
  output.hidden = false;
  if (trackResult && typeof window.jtTrackConversion === 'function') {
    window.jtTrackConversion('calculator_result_generated', { calculator: 'repayment' });
  }
}

form.addEventListener('submit', event => { event.preventDefault(); calculate(true); });
form.addEventListener('input', () => {
  output.hidden = true;
  error.textContent = '';
  fields.forEach(field => field.removeAttribute('aria-invalid'));
  resetResultActions();
});
document.getElementById('useHdbRate').addEventListener('click', () => {
  document.getElementById('repaymentRate').value = '2.6';
  document.getElementById('repaymentRate').removeAttribute('aria-invalid');
  output.hidden = true;
  error.textContent = '';
  resetResultActions();
});

copyButton?.addEventListener('click', async () => {
  if (!lastSummaryText) return;
  try {
    await navigator.clipboard.writeText(lastSummaryText);
    copyStatus.textContent = 'Result copied. You can paste it into your notes or a message.';
    copyStatus.hidden = false;
    if (typeof window.jtTrackConversion === 'function') {
      window.jtTrackConversion('calculator_result_copied', { calculator: 'repayment' });
    }
  } catch {
    copyStatus.textContent = 'Could not copy automatically. Please try again.';
    copyStatus.hidden = false;
  }
});

booking?.addEventListener('click', () => {
  if (typeof window.jtTrackConversion === 'function') {
    window.jtTrackConversion('calculator_result_action', { calculator: 'repayment', action: 'book_call' });
  }
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
