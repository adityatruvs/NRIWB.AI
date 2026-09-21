/**
 * Which instrument-specific detail fields apply to a given country × account type.
 * Shared by the Accounts dialog and the Copilot proposal card so both surface the
 * same fields (interest rate, maturity date, TDS, …) for the same account.
 */

import { LIABILITY_TYPES } from '@/lib/portfolio'
import type { AccountType } from '@/types/accounts'

export interface DetailSpec {
  interestRate: boolean
  expectedReturn: boolean
  maturityDate: boolean
  minPayment: boolean
  compounding: boolean
  depositCurrency: boolean
  tdsRate: boolean
  schemeToggle: boolean
  goldToggle: boolean
  /** True when the type carries any detail field worth a section. */
  any: boolean
}

export function detailSpec(
  country: 'US' | 'IN',
  t: AccountType,
  isSgb: boolean,
  fdScheme: 'NRE' | 'NRO',
): DetailSpec {
  // Liabilities: APR for all, a payoff date for term loans, and a min. payment.
  if (LIABILITY_TYPES.has(t)) {
    const termLoan = t !== 'credit_card' && t !== 'other_debt'
    return {
      interestRate: true,
      expectedReturn: false,
      maturityDate: termLoan,
      minPayment: true,
      compounding: false,
      depositCurrency: false,
      tdsRate: false,
      schemeToggle: false,
      goldToggle: false,
      any: true,
    }
  }
  const sgbGold = country === 'IN' && t === 'gold' && isSgb
  const inFd = country === 'IN' && t === 'fd'
  // A note receivable is a loan you've made — it carries an interest rate and a
  // repayment (due) date, just like the loans on the liability side.
  const interestRate =
    ['savings', 'nre', 'nro', 'fcnr', 'fd', 'cd', 'bond', 'notes_receivable'].includes(t) || sgbGold
  const maturityDate = ['fcnr', 'fd', 'cd', 'bond', 'notes_receivable'].includes(t) || sgbGold
  // Growth assets have no fixed coupon, so projections lean on a per-type default
  // return — let the user override it with their own estimate for this account.
  const expectedReturn =
    ['brokerage', '401k', 'ira', 'roth_ira', 'mutual_fund', 'real_estate', 'property', 'gold'].includes(t) &&
    !sgbGold
  const compounding = ['fcnr', 'fd', 'cd'].includes(t)
  const depositCurrency = t === 'fcnr'
  // NRO interest is taxable (TDS). An NRE FD is tax-free, so no TDS field.
  const tdsRate = (country === 'IN' && t === 'nro') || (inFd && fdScheme === 'NRO')
  const schemeToggle = inFd
  const goldToggle = country === 'IN' && t === 'gold'
  const any =
    interestRate ||
    expectedReturn ||
    maturityDate ||
    compounding ||
    depositCurrency ||
    tdsRate ||
    schemeToggle ||
    goldToggle
  return {
    interestRate,
    expectedReturn,
    maturityDate,
    minPayment: false,
    compounding,
    depositCurrency,
    tdsRate,
    schemeToggle,
    goldToggle,
    any,
  }
}
