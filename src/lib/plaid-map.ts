/**
 * Pure Plaid -> Account mapping. Lives apart from `lib/plaid.ts` (which imports the
 * Plaid SDK and is server-only) so it stays dependency-free and unit-testable, and
 * so the subtype mapping has a single home instead of being duplicated on the client.
 */

import { LIABILITY_TYPES } from '@/lib/portfolio'
import type { AccountType } from '@/types/accounts'

/** The slice of a Plaid `AccountBase` we actually read. */
export interface PlaidAccountInput {
  account_id: string
  name: string
  type: string
  subtype: string | null
  balances: { current: number | null; available: number | null }
}

// Plaid subtype (most specific) -> our AccountType. Lowercased before lookup.
const SUBTYPE_MAP: Record<string, AccountType> = {
  checking: 'checking',
  savings: 'savings',
  'money market': 'savings',
  'cash management': 'checking',
  cd: 'cd',
  bond: 'bond',
  brokerage: 'brokerage',
  '401k': '401k',
  'roth 401k': '401k',
  ira: 'ira',
  roth: 'roth_ira',
  'roth ira': 'roth_ira',
  'credit card': 'credit_card',
  auto: 'auto_loan',
  student: 'student_loan',
  mortgage: 'mortgage',
  home: 'home_loan',
}

// Fallback by Plaid top-level `type` when the subtype is missing/unrecognized.
const TYPE_MAP: Record<string, AccountType> = {
  depository: 'checking',
  investment: 'brokerage',
  credit: 'credit_card',
  loan: 'personal_loan',
}

/** Map a Plaid subtype/type to our AccountType, defaulting to 'other'. */
export function mapPlaidType(subtype: string | null, type: string): AccountType {
  const s = subtype?.toLowerCase() ?? ''
  if (SUBTYPE_MAP[s]) return SUBTYPE_MAP[s]
  return TYPE_MAP[type?.toLowerCase() ?? ''] ?? 'other'
}

/** Balance for a Plaid account in USD — `current`, else `available`, else 0. */
export function plaidBalanceUsd(a: PlaidAccountInput): number {
  return a.balances.current ?? a.balances.available ?? 0
}

/**
 * The Account fields to persist for a linked Plaid account (minus `lastSyncedAt`,
 * which the route stamps). `kind` is derived so a linked credit card / loan lands
 * as a liability, not an asset. Balances are USD-native (Plaid US), with INR
 * derived at the passed rate for display parity with the rest of the ledger.
 */
export function plaidAccountFields(
  a: PlaidAccountInput,
  opts: { userId: string; institutionName: string; rate: number },
) {
  const accountType = mapPlaidType(a.subtype, a.type)
  const balanceUsd = plaidBalanceUsd(a)
  return {
    userId: opts.userId,
    nickname: `${opts.institutionName} ${a.name}`.trim(),
    institution: opts.institutionName,
    accountType,
    country: 'US' as const,
    balanceUsd,
    balanceInr: balanceUsd * opts.rate,
    currency: 'USD',
    isManual: false,
    source: 'plaid',
    kind: LIABILITY_TYPES.has(accountType) ? ('liability' as const) : ('asset' as const),
    isPfic: false,
    plaidAccountId: a.account_id,
  }
}

/** The slice of Plaid's `liabilities` object we read for loan interest rates. */
export interface LoanLiabilities {
  credit?: Array<{ account_id: string | null; aprs: Array<{ apr_percentage: number; apr_type: string }> }> | null
  mortgage?: Array<{ account_id: string; interest_rate: { percentage: number | null } | null }> | null
  student?: Array<{ account_id: string; interest_rate_percentage: number | null }> | null
}

/**
 * Extract a per-account interest rate (%) from a Plaid Liabilities response, so the
 * sync can fill `details.interestRate` on loan accounts "where available". Mortgages
 * use their note rate, student loans their rate, credit cards their purchase APR.
 */
export function extractLoanRates(l: LoanLiabilities | null | undefined): Record<string, number> {
  const rates: Record<string, number> = {}
  if (!l) return rates

  for (const m of l.mortgage ?? []) {
    const p = m.interest_rate?.percentage
    if (m.account_id && typeof p === 'number') rates[m.account_id] = p
  }
  for (const s of l.student ?? []) {
    if (s.account_id && typeof s.interest_rate_percentage === 'number') {
      rates[s.account_id] = s.interest_rate_percentage
    }
  }
  for (const c of l.credit ?? []) {
    if (!c.account_id) continue
    // Prefer the purchase APR — the rate a carried balance actually accrues at.
    const apr = c.aprs?.find((a) => a.apr_type === 'purchase_apr') ?? c.aprs?.[0]
    if (apr && typeof apr.apr_percentage === 'number') rates[c.account_id] = apr.apr_percentage
  }
  return rates
}
