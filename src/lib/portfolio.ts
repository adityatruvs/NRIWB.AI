import type { AccountType, AccountSource } from '@/types/accounts'

/**
 * A normalized holding. Both mock accounts and Plaid-linked accounts conform
 * to this shape, so every selector below works uniformly across sources.
 */
export interface Holding {
  /** Stable identity for edit/remove. Assigned by AccountsContext when added. */
  id?: string
  nickname: string
  institution: string
  accountType: AccountType
  country: 'US' | 'IN'
  balanceUsd: number
  balanceInr: number
  isPfic: boolean
  source: AccountSource
}

/** USD value of a holding at the *live* rate (India balances are INR-native). */
export function usdValue(h: Holding, rate: number): number {
  return h.country === 'IN' ? h.balanceInr / rate : h.balanceUsd
}

export interface NetWorth {
  totalUsd: number
  usUsd: number
  inUsd: number
  usPct: number
  inPct: number
}

export function netWorth(holdings: Holding[], rate: number): NetWorth {
  const usUsd = holdings
    .filter((h) => h.country === 'US')
    .reduce((s, h) => s + h.balanceUsd, 0)
  const inUsd = holdings
    .filter((h) => h.country === 'IN')
    .reduce((s, h) => s + h.balanceInr / rate, 0)
  const totalUsd = usUsd + inUsd
  const usPct = totalUsd > 0 ? Math.round((usUsd / totalUsd) * 100) : 0
  return { totalUsd, usUsd, inUsd, usPct, inPct: 100 - usPct }
}

/* ── Asset-class grouping ─────────────────────────────────────────────────── */

export type AssetClass =
  | 'cash'
  | 'investments'
  | 'retirement'
  | 'realEstate'
  | 'fixedDeposits'
  | 'mutualFunds'
  | 'other'

export const ASSET_CLASS_META: Record<
  AssetClass,
  { label: string; colorVar: string }
> = {
  cash: { label: 'Cash & Banking', colorVar: 'var(--us)' },
  investments: { label: 'Investments', colorVar: 'var(--brand)' },
  retirement: { label: 'Retirement', colorVar: 'oklch(0.6 0.13 300)' },
  realEstate: { label: 'Real Estate', colorVar: 'var(--saffron)' },
  fixedDeposits: { label: 'Fixed Deposits', colorVar: 'var(--india)' },
  mutualFunds: { label: 'Mutual Funds', colorVar: 'oklch(0.6 0.14 200)' },
  other: { label: 'Other', colorVar: 'var(--muted-foreground)' },
}

const TYPE_TO_CLASS: Record<AccountType, AssetClass> = {
  checking: 'cash',
  savings: 'cash',
  nre: 'cash',
  nro: 'cash',
  fcnr: 'cash',
  brokerage: 'investments',
  '401k': 'retirement',
  ira: 'retirement',
  roth_ira: 'retirement',
  real_estate: 'realEstate',
  property: 'realEstate',
  fd: 'fixedDeposits',
  mutual_fund: 'mutualFunds',
  gold: 'other',
  other: 'other',
}

export interface AssetSlice {
  key: AssetClass
  label: string
  colorVar: string
  usd: number
  pct: number
}

export function byAssetClass(holdings: Holding[], rate: number): AssetSlice[] {
  const totals = new Map<AssetClass, number>()
  for (const h of holdings) {
    const cls = TYPE_TO_CLASS[h.accountType] ?? 'other'
    totals.set(cls, (totals.get(cls) ?? 0) + usdValue(h, rate))
  }
  const grand = [...totals.values()].reduce((s, v) => s + v, 0) || 1
  return [...totals.entries()]
    .map(([key, usd]) => ({
      key,
      label: ASSET_CLASS_META[key].label,
      colorVar: ASSET_CLASS_META[key].colorVar,
      usd,
      pct: (usd / grand) * 100,
    }))
    .sort((a, b) => b.usd - a.usd)
}

/* ── Compliance ───────────────────────────────────────────────────────────── */

export function pficHoldings(holdings: Holding[]): Holding[] {
  return holdings.filter((h) => h.isPfic)
}

export const FBAR_THRESHOLD_USD = 10_000
export const FATCA_THRESHOLD_USD = 50_000

export interface FbarStatus {
  currentUsd: number
  peakUsd: number
  pctOfThreshold: number
  crossed: boolean
}

/**
 * FBAR tracks the *peak* aggregate balance of all India financial accounts.
 * We approximate the yearly peak as a modest premium over the current
 * aggregate (live demo data) — in production this is the true running max.
 */
export function fbarStatus(holdings: Holding[], rate: number): FbarStatus {
  const currentUsd = holdings
    .filter((h) => h.country === 'IN')
    .reduce((s, h) => s + h.balanceInr / rate, 0)
  const peakUsd = currentUsd * 1.04
  return {
    currentUsd,
    peakUsd,
    pctOfThreshold: (peakUsd / FBAR_THRESHOLD_USD) * 100,
    crossed: peakUsd >= FBAR_THRESHOLD_USD,
  }
}

export type ComplianceLevel = 'ok' | 'attention' | 'overdue'

export interface ComplianceItem {
  key: string
  level: ComplianceLevel
  title: string
  detail: string
  meta: string
}

export function complianceItems(
  holdings: Holding[],
  rate: number,
): ComplianceItem[] {
  const items: ComplianceItem[] = []
  const fbar = fbarStatus(holdings, rate)
  const pfics = pficHoldings(holdings)
  const indiaUsd = netWorth(holdings, rate).inUsd

  items.push({
    key: 'fbar',
    level: fbar.crossed ? 'overdue' : fbar.pctOfThreshold > 70 ? 'attention' : 'ok',
    title: 'FBAR — FinCEN 114',
    detail: fbar.crossed
      ? `India accounts peaked at ${usd(fbar.peakUsd)} — above the $10,000 threshold. Filing required.`
      : `India accounts peaked at ${usd(fbar.peakUsd)} — ${Math.round(fbar.pctOfThreshold)}% of the $10,000 limit.`,
    meta: 'Due Apr 15 (auto-ext. Oct 15)',
  })

  items.push({
    key: 'pfic',
    level: pfics.length > 0 ? 'attention' : 'ok',
    title: 'PFIC — Form 8621',
    detail:
      pfics.length > 0
        ? `${pfics.length} India mutual fund${pfics.length > 1 ? 's' : ''} classified as PFIC. Form 8621 required per fund.`
        : 'No PFIC-classified holdings detected.',
    meta: 'File with US tax return',
  })

  items.push({
    key: 'fatca',
    level: indiaUsd > FATCA_THRESHOLD_USD ? 'attention' : 'ok',
    title: 'FATCA — Form 8938',
    detail:
      indiaUsd > FATCA_THRESHOLD_USD
        ? `Foreign assets total ${usd(indiaUsd)} — above the $50,000 reporting threshold.`
        : 'Foreign assets below the $50,000 reporting threshold.',
    meta: 'File with US tax return',
  })

  return items
}

/* ── Small currency helper used in detail strings ─────────────────────────── */
function usd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

/* ── Account-type display labels (shared across pages) ────────────────────── */
export const TYPE_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  brokerage: 'Brokerage',
  '401k': '401(k)',
  ira: 'IRA',
  roth_ira: 'Roth IRA',
  real_estate: 'Real Estate',
  nre: 'NRE',
  nro: 'NRO',
  fcnr: 'FCNR',
  fd: 'Fixed Deposit',
  mutual_fund: 'Mutual Fund',
  property: 'Property',
  gold: 'Gold',
  other: 'Other',
}
