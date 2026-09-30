/**
 * Prepay the loan, or invest the money? Pure + testable, pre-tax.
 *
 *  A (prepay): the extra goes to the loan. Once it's paid off, the freed payment
 *    (and any monthly extra) is invested at the expected return.
 *  B (invest): the extra is invested; the loan runs normally. Once it's paid off,
 *    the freed payment is invested too, so both scenarios spend the same cash.
 *
 * Both are compared at the horizon on net position (investments − remaining
 * loan). All loan cash flows are in the loan's currency. For an INR loan paid
 * from dollars, investments are dollar assets (valued at today's rate) while the
 * remaining loan is valued at the horizon rate, so a rupee move re-prices it: a
 * stronger rupee makes the leftover loan cost more dollars, which favours prepaying.
 */

import type { LoanCurrency } from '@/lib/debt-goal'

export interface PrepayInputs {
  /** Outstanding balance, loan currency. */
  balance: number
  /** Annual rate, % (e.g. 8.5). */
  aprPct: number
  /** Current monthly payment, loan currency. */
  payment: number
  /** Extra money, loan currency. */
  extra: number
  extraMode: 'lump' | 'monthly'
  horizonMonths: number
  /** Expected annual investment return as a fraction (0.07 = 7%). */
  investReturn: number
  currency: LoanCurrency
  /** Today's rupees per dollar (ignored for USD loans). */
  rate: number
  /** Rupee move by the horizon, as a fraction: +0.05 = rupee 5% stronger. INR loans only. */
  rupeeMove?: number
}

export interface ScenarioResult {
  /** Investments − remaining loan at the horizon, USD. */
  endNetUsd: number
  investmentsUsd: number
  loanRemainingUsd: number
  /** Interest paid over the life of the loan, loan currency. */
  lifetimeInterest: number
  /** Months until the loan is paid off (may be past the horizon), or null if never. */
  payoffMonths: number | null
}

export interface PrepayResult {
  prepay: ScenarioResult
  invest: ScenarioResult
  /** Lifetime interest avoided by prepaying, loan currency. */
  interestSaved: number
  /** How much sooner the loan is paid off by prepaying, or null if either never pays off. */
  monthsSaved: number | null
}

const MAX_MONTHS = 1200

/** Month-by-month amortization. Returns the balance after each month and the interest paid. */
function runLoan(balance: number, aprPct: number, payment: (month: number) => number) {
  const r = aprPct / 100 / 12
  let bal = balance
  let interest = 0
  const balances: number[] = [] // balances[t-1] = after month t
  const paidIn: number[] = [] // cash actually paid to the loan in month t
  let payoff: number | null = bal <= 0 ? 0 : null
  for (let t = 1; t <= MAX_MONTHS && payoff === null; t++) {
    const i = bal * r
    const due = bal + i
    const pay = Math.min(payment(t), due)
    interest += i
    bal = due - pay
    if (bal < 1e-6) bal = 0
    balances.push(bal)
    paidIn.push(pay)
    if (bal === 0) payoff = t
  }
  return { balances, paidIn, interest, payoff }
}

function scenario(
  inp: PrepayInputs,
  loanStart: number,
  investAtStart: number,
  loanPayment: (t: number) => number,
  budget: (t: number) => number,
): ScenarioResult {
  const loan = runLoan(loanStart, inp.aprPct, loanPayment)
  // Invest whatever of the monthly budget the loan didn't take (all of it after payoff).
  const ri = inp.investReturn / 12
  let inv = investAtStart
  for (let t = 1; t <= inp.horizonMonths; t++) {
    const toLoan = loan.paidIn[t - 1] ?? 0
    inv = inv * (1 + ri) + Math.max(0, budget(t) - toLoan)
  }
  const remaining = inp.horizonMonths === 0 ? loanStart : (loan.balances[inp.horizonMonths - 1] ?? 0)

  const isInr = inp.currency === 'INR'
  const today = isInr ? inp.rate : 1
  const horizonRate = isInr ? inp.rate / (1 + (inp.rupeeMove ?? 0)) : 1
  const investmentsUsd = inv / today
  const loanRemainingUsd = remaining / horizonRate
  return {
    endNetUsd: investmentsUsd - loanRemainingUsd,
    investmentsUsd,
    loanRemainingUsd,
    lifetimeInterest: loan.interest,
    payoffMonths: loan.payoff,
  }
}

export function comparePrepay(inp: PrepayInputs): PrepayResult {
  const lump = inp.extraMode === 'lump' ? Math.max(0, inp.extra) : 0
  const monthly = inp.extraMode === 'monthly' ? Math.max(0, inp.extra) : 0
  // Both scenarios have the same cash each month: the regular payment + the monthly extra.
  const budget = () => inp.payment + monthly

  const used = Math.min(lump, inp.balance)
  const prepay = scenario(inp, inp.balance - used, lump - used, () => inp.payment + monthly, budget)
  const invest = scenario(inp, inp.balance, lump, () => inp.payment, budget)

  return {
    prepay,
    invest,
    interestSaved: invest.lifetimeInterest - prepay.lifetimeInterest,
    monthsSaved:
      prepay.payoffMonths != null && invest.payoffMonths != null ? invest.payoffMonths - prepay.payoffMonths : null,
  }
}
