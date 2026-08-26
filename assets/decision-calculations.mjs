// Pure, browser-local arithmetic. These estimates do not determine loan eligibility.
function amount(value, label, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`${label} must be between 0 and ${maximum.toLocaleString('en-SG')}.`);
  }
  return value;
}

const cents = value => Math.round((value + Number.EPSILON) * 100);

export function repaymentEstimate({ principal, annualRatePercent, years }) {
  amount(principal, 'Loan amount', 100000000);
  amount(annualRatePercent, 'Annual interest rate', 100);
  if (!Number.isInteger(years) || years < 1 || years > 25) {
    throw new RangeError('Loan term must be a whole number from 1 to 25 years.');
  }
  const principalCents = cents(principal);
  const months = years * 12;
  const rate = annualRatePercent / 1200;
  const paymentCents = Math.round(rate === 0
    ? principalCents / months
    : principalCents * rate / -Math.expm1(-months * Math.log1p(rate)));
  let balanceCents = principalCents;
  let interestCents = 0;
  let totalPaidCents = 0;
  let finalPaymentCents = 0;
  const schedule = [];
  for (let month = 1; month <= months; month++) {
    const interest = Math.round(balanceCents * rate);
    const payment = month === months
      ? balanceCents + interest
      : Math.min(paymentCents, balanceCents + interest);
    balanceCents -= payment - interest;
    interestCents += interest;
    totalPaidCents += payment;
    finalPaymentCents = payment;
    if (month % 12 === 1) schedule.push({ year: Math.ceil(month / 12), paidCents: 0, interestCents: 0, principalCents: 0, balanceCents: 0 });
    const year = schedule.at(-1);
    year.paidCents += payment;
    year.interestCents += interest;
    year.principalCents += payment - interest;
    year.balanceCents = balanceCents;
  }
  return { principalCents, paymentCents, finalPaymentCents, interestCents, totalPaidCents, schedule };
}

export function commissionEstimate({ salePrice, ratePercent, gstTreatment, extras }) {
  amount(salePrice, 'Sale price', 100000000);
  amount(ratePercent, 'Commission rate', 100);
  amount(extras, 'All-in extras', 1000000);
  if (!['none', 'exclusive', 'inclusive'].includes(gstTreatment)) throw new RangeError('Choose a GST treatment.');
  const quotedCents = cents(salePrice * ratePercent / 100);
  const feeCents = gstTreatment === 'inclusive' ? Math.round(quotedCents / 1.09) : quotedCents;
  const gstCents = gstTreatment === 'exclusive' ? Math.round(feeCents * 0.09)
    : gstTreatment === 'inclusive' ? quotedCents - feeCents : 0;
  const extrasCents = cents(extras);
  return { feeCents, gstCents, extrasCents, totalCents: feeCents + gstCents + extrasCents };
}
