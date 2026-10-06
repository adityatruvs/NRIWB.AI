/**
 * Which instrument-specific detail fields apply to a given country × account type.
 * Shared by the Accounts dialog and the Copilot proposal card so both surface the
 * same fields (interest rate, maturity date, TDS, …) for the same account.
 */

import { LIABILITY_TYPES, TYPE_LABELS, grossUsd, isUsdNative } from '@/lib/portfolio'
import type { AccountType } from '@/types/accounts'

/* ── Type choices ─────────────────────────────────────────────────────────────
 * An India fixed deposit is stored as accountType `fd` + `details.fdScheme`;
 * `nre`/`nro` are the savings accounts. Offering "NRE" next to a bare "Fixed
 * Deposit" let an "HDFC NRE FD" be filed as savings (Cash & Banking), so the
 * pickers offer each FD per scheme instead — the product and scheme are one pick.
 */

export type FdScheme = 'NRE' | 'NRO'
export type TypeChoice = AccountType | 'fd_nre' | 'fd_nro'

/** India asset choices for the pickers, in display order. */
export const IN_ASSET_CHOICES: TypeChoice[] = [
  'nre', 'nro', 'fd_nre', 'fd_nro', 'fcnr', 'mutual_fund', 'brokerage', 'property', 'gold', 'vehicle', 'notes_receivable', 'other',
]

/** The picker choice for a stored type + scheme. A legacy India fd without a scheme reads as NRE. */
export function typeChoice(country: 'US' | 'IN', t: AccountType, fdScheme?: FdScheme): TypeChoice {
  if (country === 'IN' && t === 'fd') return fdScheme === 'NRO' ? 'fd_nro' : 'fd_nre'
  return t
}

/** The stored type (+ scheme, for an FD) a picker choice means. */
export function fromTypeChoice(c: TypeChoice): { accountType: AccountType; fdScheme?: FdScheme } {
  if (c === 'fd_nre') return { accountType: 'fd', fdScheme: 'NRE' }
  if (c === 'fd_nro') return { accountType: 'fd', fdScheme: 'NRO' }
  return { accountType: c }
}

export function typeChoiceLabel(c: TypeChoice): string {
  if (c === 'fd_nre') return 'NRE Fixed Deposit'
  if (c === 'fd_nro') return 'NRO Fixed Deposit'
  return TYPE_LABELS[c] ?? c
}

const FD_NAME = /\b(fds?|fixed deposits?|term deposits?)\b/i

/**
 * The FD scheme an India `nre`/`nro` account most likely is, judging by a name
 * like "HDFC NRE FD" — null when it doesn't look mistyped. A heuristic, so it
 * only ever drives a suggestion (the dialog nudge, the migration's review list);
 * nothing re-types an account on its own.
 */
export function mistypedFdScheme(a: { country: string; accountType: string; nickname: string }): FdScheme | null {
  if (a.country !== 'IN' || !FD_NAME.test(a.nickname)) return null
  if (a.accountType === 'nre') return 'NRE'
  if (a.accountType === 'nro') return 'NRO'
  return null
}

/**
 * The one-off migration's change for a saved row that looks mistyped (see
 * `mistypedFdScheme`), or null to leave it. Keeps every stored detail and any
 * scheme already set; only the type and a missing scheme change.
 */
export function fdRetypePatch(row: {
  country: string
  accountType: string
  nickname: string
  details: unknown
}): { accountType: 'fd'; details: Record<string, unknown> } | null {
  const scheme = mistypedFdScheme(row)
  if (!scheme) return null
  const details =
    row.details && typeof row.details === 'object' && !Array.isArray(row.details)
      ? (row.details as Record<string, unknown>)
      : {}
  const kept = details.fdScheme === 'NRE' || details.fdScheme === 'NRO' ? details.fdScheme : scheme
  return { accountType: 'fd', details: { ...details, fdScheme: kept } }
}

export interface DetailSpec {
  interestRate: boolean
  expectedReturn: boolean
  maturityDate: boolean
  minPayment: boolean
  compounding: boolean
  depositCurrency: boolean
  tdsRate: boolean
  /** An India FD — carries `fdScheme` (picked with the type, see `TypeChoice`). */
  hasScheme: boolean
  goldToggle: boolean
  /** True when the type carries any detail field worth a section. */
  any: boolean
}

export function detailSpec(
  country: 'US' | 'IN',
  t: AccountType,
  isSgb: boolean,
  fdScheme: FdScheme,
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
      hasScheme: false,
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
  const hasScheme = inFd
  const goldToggle = country === 'IN' && t === 'gold'
  const any =
    interestRate ||
    expectedReturn ||
    maturityDate ||
    compounding ||
    depositCurrency ||
    tdsRate ||
    hasScheme ||
    goldToggle
  return {
    interestRate,
    expectedReturn,
    maturityDate,
    minPayment: false,
    compounding,
    depositCurrency,
    tdsRate,
    hasScheme,
    goldToggle,
    any,
  }
}

/* ── Entry currency ───────────────────────────────────────────────────────────
 * An FCNR deposit is held in a foreign currency, not rupees. The app only has
 * USD↔INR rates, so its balance is entered in US dollars (for a GBP/EUR/… deposit,
 * its dollar value). Everything else is entered in the country's own currency.
 */

/** The currency a balance is typed in for this country × type. */
export function entryCurrency(country: 'US' | 'IN', accountType: AccountType): 'USD' | 'INR' {
  return isUsdNative({ country, accountType }) ? 'USD' : 'INR'
}

/** Both stored balances from an amount typed in the entry currency. */
export function balancesFromEntry(
  country: 'US' | 'IN',
  accountType: AccountType,
  amount: number,
  rate: number,
): { balanceUsd: number; balanceInr: number } {
  return entryCurrency(country, accountType) === 'USD'
    ? { balanceUsd: amount, balanceInr: amount * rate }
    : { balanceUsd: amount / rate, balanceInr: amount }
}

/**
 * A saved balance shown back in its entry currency (for editing). With `rate`, an
 * older FCNR row that has only rupees is shown as its dollar value.
 */
export function entryAmount(
  h: { country: 'US' | 'IN'; accountType: AccountType; balanceUsd: number; balanceInr: number },
  rate?: number,
): number {
  if (entryCurrency(h.country, h.accountType) === 'INR') return h.balanceInr
  return rate ? grossUsd(h, rate) : h.balanceUsd
}
