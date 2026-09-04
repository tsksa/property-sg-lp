// Amounts are dollars on input and integer cents on output. No eligibility model.
export function resaleCashReadiness(input) {
  const amounts = {};
  for (const key of ['price', 'valuation', 'loan', 'cpf', 'deposit', 'cash', 'reserve']) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000000) {
      throw new RangeError('Enter valid non-negative amounts up to S$100,000,000.');
    }
    amounts[key] = Math.round(value * 100);
  }
  const { price, valuation, loan, cpf, deposit, cash, reserve } = amounts;
  if (!price || !valuation) throw new RangeError('Purchase price and valuation must be greater than zero.');
  const basis = Math.min(price, valuation);
  if (loan > basis) throw new RangeError('Loan amount cannot exceed the lower of price and valuation. Check the amount to be drawn with your lender.');
  if (deposit > price || deposit > 500000) throw new RangeError('Deposit already paid cannot exceed S$5,000 or the purchase price.');
  if (loan + deposit > price) throw new RangeError('Loan plus deposit exceeds the purchase price. Check the actual loan drawdown.');
  const cov = price - basis;
  const remainingPrice = price - loan - deposit;
  // CPF cannot fund COV; deposit is already part-payment, never an extra cost.
  const cpfApplied = Math.min(cpf, basis - loan, remainingPrice);
  const cashForPrice = remainingPrice - cpfApplied;
  const cashRequired = cashForPrice + reserve;
  return { price, loan, deposit, cov, cpfApplied, unusedCpf: cpf - cpfApplied,
    cashForPrice, reserve, cashRequired, shortfall: Math.max(0, cashRequired - cash),
    cashRemaining: Math.max(0, cash - cashRequired) };
}
