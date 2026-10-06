/**
 * Debt summaries across both countries. Pure + testable.
 */

import { grossUsd, isLiability, type Holding } from '@/lib/portfolio'

export interface DebtRollup {
  /** Total owed, USD at the current rate. */
  totalUsd: number
  /** Balance-weighted average APR (%) over loans that have one; null if none do. */
  avgAprPct: number | null
  /** Sum of minimum payments per month, USD (India EMIs converted at the current rate). */
  monthlyPaymentsUsd: number
  byCountry: { US: number; IN: number }
  count: number
  /** Loans with no interest rate — left out of the average. */
  missingApr: Holding[]
  /** Loans with no minimum payment — left out of the monthly total. */
  missingPayment: Holding[]
}

/** Amount owed on one loan in USD (positive). */
export const owedUsd = (h: Holding, rate: number) => grossUsd(h, rate)

export function debtRollup(holdings: Holding[], rate: number): DebtRollup {
  const loans = holdings.filter(isLiability)
  let totalUsd = 0
  let aprWeight = 0
  let aprSum = 0
  let monthlyPaymentsUsd = 0
  const byCountry = { US: 0, IN: 0 }
  const missingApr: Holding[] = []
  const missingPayment: Holding[] = []

  for (const h of loans) {
    const owed = Math.max(0, owedUsd(h, rate))
    totalUsd += owed
    byCountry[h.country] += owed
    const apr = h.details?.interestRate
    if (apr == null) missingApr.push(h)
    else {
      aprSum += apr * owed
      aprWeight += owed
    }
    const pay = h.details?.minPayment
    if (pay == null || pay <= 0) missingPayment.push(h)
    else monthlyPaymentsUsd += h.country === 'IN' ? pay / rate : pay
  }

  return {
    totalUsd,
    avgAprPct: aprWeight > 0 ? aprSum / aprWeight : null,
    monthlyPaymentsUsd,
    byCountry,
    count: loans.length,
    missingApr,
    missingPayment,
  }
}

/* ── Currency mismatch ─────────────────────────────────────────────────────── */

/** INR debt below this (USD equivalent) is too small to warn about. */
export const MISMATCH_MIN_INR_DEBT_USD = 10_000
/** The debt/income currency gap (percentage points) that triggers the warning. */
export const MISMATCH_MIN_GAP_PTS = 50
/** The rupee move the warning quantifies. */
export const MISMATCH_MOVE = 0.05

export interface CurrencyMismatch {
  /** 0..100 */
  inrDebtSharePct: number
  /** 0..100. Budget income is USD-only today, so this is 0. */
  inrIncomeSharePct: number
  inrDebtInr: number
  inrDebtUsd: number
  /** Extra USD cost of the INR debt if the rupee strengthens 5%: INR debt / rate × 0.05. */
  exposureUsd: number
  fires: boolean
}

/**
 * NRIs often earn in dollars and owe in rupees, so a rupee move changes what the
 * loan costs in dollars. Fires when the debt/income currency shares differ by 50+
 * points AND the INR debt is at least $10,000 equivalent.
 */
export function currencyMismatch(holdings: Holding[], rate: number): CurrencyMismatch {
  const r = debtRollup(holdings, rate)
  const inrDebtInr = holdings
    .filter((h) => isLiability(h) && h.country === 'IN')
    .reduce((s, h) => s + Math.max(0, h.balanceInr), 0)
  const inrDebtUsd = inrDebtInr / rate
  const inrDebtSharePct = r.totalUsd > 0 ? (inrDebtUsd / r.totalUsd) * 100 : 0
  const inrIncomeSharePct = 0
  return {
    inrDebtSharePct,
    inrIncomeSharePct,
    inrDebtInr,
    inrDebtUsd,
    exposureUsd: inrDebtUsd * MISMATCH_MOVE,
    fires:
      Math.abs(inrDebtSharePct - inrIncomeSharePct) >= MISMATCH_MIN_GAP_PTS &&
      inrDebtUsd >= MISMATCH_MIN_INR_DEBT_USD,
  }
}

/**
 * A dismissed warning stays dismissed until the INR debt share moves 10+ points
 * from where it was when dismissed.
 */
export function mismatchStillDismissed(dismissedAtSharePct: number | null, currentSharePct: number): boolean {
  return dismissedAtSharePct !== null && Math.abs(currentSharePct - dismissedAtSharePct) < 10
}
