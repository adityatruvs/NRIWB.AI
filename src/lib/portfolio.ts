import type { AccountType, AccountSource } from '@/types/accounts'
import type { RecordedFbarPeak } from '@/lib/fbar'

/**
 * Optional, instrument-specific attributes. Only the fields relevant to a
 * holding's country × type are ever populated — see `detailSpec` in the
 * account dialog for which fields surface where. Everything here is additive:
 * a holding with no `details` behaves exactly as before.
 */
export interface HoldingDetails {
  /** Annual interest / coupon rate, percent (e.g. 7.1). Fixed-income + savings. */
  interestRate?: number
  /**
   * Per-account expected annual return override, percent (e.g. 11). Lets the user
   * pin a projection rate on an estimated holding (a specific fund/stock) instead
   * of the type default. Takes precedence over everything in `expectedReturn()`.
   */
  expectedReturn?: number
  /** ISO YYYY-MM-DD maturity date. FDs, FCNR, Sovereign Gold Bonds. */
  maturityDate?: string
  /** Compounding frequency, for interest projection. FDs, FCNR. */
  compounding?: 'monthly' | 'quarterly' | 'half_yearly' | 'annually' | 'maturity'
  /**
   * Currency the deposit is actually held in. FCNR is foreign-currency-
   * denominated (not INR), so this drives true FX exposure. Defaults to the
   * country's native currency when absent.
   */
  depositCurrency?: 'USD' | 'GBP' | 'EUR' | 'CAD' | 'AUD' | 'INR'
  /** India tax withheld at source, percent. NRO interest, NRO fixed deposits. */
  tdsRate?: number
  /**
   * Scheme of an India fixed deposit. Drives tax: NRE interest is tax-free
   * (no TDS) and fully repatriable; NRO interest is taxable (TDS applies).
   */
  fdScheme?: 'NRE' | 'NRO'
  /** Sovereign Gold Bond (carries a coupon + maturity) vs physical gold. */
  isSgb?: boolean
  /** Minimum / planned monthly payment, in the holding's native currency. Liabilities. */
  minPayment?: number
}

/**
 * Whose name a holding is in. `self` = solely yours; `joint` = you plus the
 * `coOwners`; `family` = held in a family member's name (the `coOwners`), not yours.
 */
export type Ownership = 'self' | 'joint' | 'family'

export type OwnerRelation = 'spouse' | 'father' | 'mother' | 'sibling' | 'child' | 'other'

export interface CoOwner {
  name: string
  relation: OwnerRelation
}

export const RELATION_LABELS: Record<OwnerRelation, string> = {
  spouse: 'Spouse',
  father: 'Father',
  mother: 'Mother',
  sibling: 'Sibling',
  child: 'Child',
  other: 'Other',
}

/** Short label for who holds title, e.g. "You + Father (Ramesh)". Null when solely yours. */
export function ownershipLabel(h: Pick<Holding, 'ownership' | 'coOwners'>): string | null {
  const own = h.ownership ?? 'self'
  const people = (h.coOwners ?? []).map((c) =>
    c.relation === 'other' ? c.name || 'Other' : `${RELATION_LABELS[c.relation]}${c.name ? ` (${c.name})` : ''}`,
  )
  if (own === 'joint') return people.length ? `You + ${people.join(' + ')}` : 'Joint'
  if (own === 'family') return people.length ? people.join(' + ') : 'Family member'
  return null
}

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
  /**
   * Asset (you own it) or liability (you owe it). Absent ⇒ asset, so all
   * existing holdings stay assets. Liability balances are stored as positive
   * amounts owed; `usdValue` applies the negative sign.
   */
  kind?: 'asset' | 'liability'
  /**
   * For a liability: the `id` of the asset it's secured against (e.g. a mortgage
   * → the home). Many loans may point at one asset; the asset's equity is its
   * value minus these. Purely for attribution — net worth still nets all debt.
   */
  securedAgainstId?: string
  /** Whose name this is held in. Absent ⇒ `self`. */
  ownership?: Ownership
  /** Joint co-holders, or the family title-holder(s). Only set when `ownership` isn't `self`. */
  coOwners?: CoOwner[]
  /** Instrument-specific attributes (interest rate, maturity, …). Optional. */
  details?: HoldingDetails
  /**
   * ISO timestamp of when this balance was last confirmed — a Plaid sync for
   * linked accounts, or a manual save/"mark updated" for manual ones. Absent for
   * demo/seed rows. Drives the freshness indicator (see `@/lib/freshness`).
   */
  lastSyncedAt?: string
  /** Linked (Plaid) account whose bank login expired — show "Reconnect". Server-set. */
  needsReauth?: boolean
  /** The Plaid item this account syncs through; present with `needsReauth`. */
  plaidItemId?: string
}

/** Account types that represent debt. Used to set `kind` and drive the form. */
export const LIABILITY_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  'notes_payable',
  'mortgage',
  'heloc',
  'home_loan',
  'auto_loan',
  'student_loan',
  'education_loan',
  'personal_loan',
  'credit_card',
  'other_debt',
])

/** True when a holding is a debt (by explicit kind, or by its type as a fallback). */
export function isLiability(h: Holding): boolean {
  return h.kind === 'liability' || LIABILITY_TYPES.has(h.accountType)
}

/**
 * Asset types a loan can sensibly be secured against — tangible/owned things you
 * borrow against, not cash or deposits. Drives the link pickers on both sides.
 */
export const SECURABLE_ASSET_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  'real_estate',
  'property',
  'brokerage',
  'mutual_fund',
  'gold',
  'vehicle',
  'other',
])

/** An asset (not a debt) that a loan can be secured against. */
export function isSecurableAsset(h: Holding): boolean {
  return !isLiability(h) && SECURABLE_ASSET_TYPES.has(h.accountType)
}

/**
 * Signed USD value at the *live* rate (India balances are INR-native).
 * Liabilities return a negative value, so any sum over holdings nets debt out.
 */
export function usdValue(h: Holding, rate: number): number {
  const gross = h.country === 'IN' ? h.balanceInr / rate : h.balanceUsd
  return isLiability(h) ? -gross : gross
}

/** Liabilities secured against a given asset id (e.g. the mortgages on a home). */
export function loansSecuredBy(assetId: string | undefined, holdings: Holding[]): Holding[] {
  if (!assetId) return []
  return holdings.filter((h) => isLiability(h) && h.securedAgainstId === assetId)
}

/**
 * An asset's equity: its value minus the loans secured against it. Uses signed
 * `usdValue`, so the secured loans (already negative) simply add in.
 */
export function assetEquity(asset: Holding, holdings: Holding[], rate: number): number {
  return loansSecuredBy(asset.id, holdings).reduce(
    (eq, loan) => eq + usdValue(loan, rate),
    usdValue(asset, rate),
  )
}

export interface NetWorth {
  /** Net worth: gross assets − liabilities. */
  totalUsd: number
  /** Net (assets − liabilities) within each jurisdiction. */
  usUsd: number
  inUsd: number
  /** Jurisdiction split of net worth (clamped to ≥0 so the donut stays sane). */
  usPct: number
  inPct: number
  /** Gross totals, before netting. */
  assetsUsd: number
  liabilitiesUsd: number
}

export function netWorth(holdings: Holding[], rate: number): NetWorth {
  let assetsUsd = 0
  let liabilitiesUsd = 0
  let usUsd = 0
  let inUsd = 0
  for (const h of holdings) {
    const v = usdValue(h, rate) // signed: liabilities are negative
    if (v >= 0) assetsUsd += v
    else liabilitiesUsd += -v
    if (h.country === 'US') usUsd += v
    else inUsd += v
  }
  const totalUsd = usUsd + inUsd
  const base = Math.max(usUsd, 0) + Math.max(inUsd, 0)
  // With no assets, both splits are 0 — never 100% India (100 − 0) as before.
  const usPct = base > 0 ? Math.round((Math.max(usUsd, 0) / base) * 100) : 0
  const inPct = base > 0 ? 100 - usPct : 0
  return { totalUsd, usUsd, inUsd, usPct, inPct, assetsUsd, liabilitiesUsd }
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
  retirement: { label: 'Retirement', colorVar: 'oklch(0.55 0.18 292)' },
  realEstate: { label: 'Real Estate', colorVar: 'var(--saffron)' },
  fixedDeposits: { label: 'Fixed Deposits', colorVar: 'oklch(0.63 0.17 12)' },
  mutualFunds: { label: 'Mutual Funds', colorVar: 'oklch(0.64 0.11 195)' },
  other: { label: 'Other', colorVar: 'var(--muted-foreground)' },
}

const TYPE_TO_CLASS: Record<AccountType, AssetClass> = {
  checking: 'cash',
  savings: 'cash',
  nre: 'cash',
  nro: 'cash',
  fcnr: 'cash',
  cd: 'fixedDeposits',
  bond: 'fixedDeposits',
  brokerage: 'investments',
  '401k': 'retirement',
  ira: 'retirement',
  roth_ira: 'retirement',
  real_estate: 'realEstate',
  property: 'realEstate',
  fd: 'fixedDeposits',
  mutual_fund: 'mutualFunds',
  gold: 'other',
  vehicle: 'other',
  notes_receivable: 'other',
  other: 'other',
  // Liabilities never appear in asset-class grouping (filtered out before use).
  notes_payable: 'other',
  mortgage: 'other',
  heloc: 'other',
  home_loan: 'other',
  auto_loan: 'other',
  student_loan: 'other',
  education_loan: 'other',
  personal_loan: 'other',
  credit_card: 'other',
  other_debt: 'other',
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
    if (isLiability(h)) continue // debts aren't an asset class
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

/* ── Liability breakdown ──────────────────────────────────────────────────── */

/** Debt categories — the liability-side counterpart to AssetClass. */
export type LiabilityClass = 'mortgage' | 'auto' | 'student' | 'creditCard' | 'personal' | 'other'

export const LIABILITY_CLASS_META: Record<
  LiabilityClass,
  { label: string; colorVar: string }
> = {
  mortgage: { label: 'Mortgage & Home', colorVar: 'oklch(0.58 0.18 25)' },
  auto: { label: 'Auto', colorVar: 'oklch(0.65 0.16 45)' },
  student: { label: 'Student & Education', colorVar: 'oklch(0.62 0.15 8)' },
  creditCard: { label: 'Credit Cards', colorVar: 'oklch(0.55 0.2 12)' },
  personal: { label: 'Personal', colorVar: 'oklch(0.6 0.13 32)' },
  other: { label: 'Other Debt', colorVar: 'var(--muted-foreground)' },
}

const TYPE_TO_LIABILITY: Partial<Record<AccountType, LiabilityClass>> = {
  mortgage: 'mortgage',
  home_loan: 'mortgage',
  heloc: 'mortgage',
  auto_loan: 'auto',
  student_loan: 'student',
  education_loan: 'student',
  credit_card: 'creditCard',
  personal_loan: 'personal',
  notes_payable: 'other',
  other_debt: 'other',
}

export interface LiabilitySlice {
  key: LiabilityClass
  label: string
  colorVar: string
  /** Positive amount owed, in USD. */
  usd: number
  pct: number
}

/**
 * Summarise debts by category — the liability counterpart to `byAssetClass`, so the
 * per-country breakdown can show *what kind* of debt a user carries instead of one
 * lump number. `usd` is the positive amount owed; `pct` is share of total debt.
 */
export function byLiabilityClass(holdings: Holding[], rate: number): LiabilitySlice[] {
  const totals = new Map<LiabilityClass, number>()
  for (const h of holdings) {
    if (!isLiability(h)) continue
    const cls = TYPE_TO_LIABILITY[h.accountType] ?? 'other'
    totals.set(cls, (totals.get(cls) ?? 0) + Math.abs(usdValue(h, rate)))
  }
  const grand = [...totals.values()].reduce((s, v) => s + v, 0) || 1
  return [...totals.entries()]
    .map(([key, usd]) => ({
      key,
      label: LIABILITY_CLASS_META[key].label,
      colorVar: LIABILITY_CLASS_META[key].colorVar,
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
  /** India account balances today, USD. */
  currentUsd: number
  /**
   * The figure compared with the threshold: the recorded yearly maxima when the
   * app has balance history this year, otherwise just today's balances. Never an
   * estimate — FBAR is a legal filing, so the app only states what it knows.
   */
  peakUsd: number
  /** `recorded`: highest balances recorded since `since`. `current`: today's balances only. */
  basis: 'recorded' | 'current'
  /** First day (YYYY-MM-DD) of this year's recorded history, when basis is `recorded`. */
  since: string | null
  /**
   * When the India balances were last confirmed (oldest and newest `lastSyncedAt`),
   * so a current-balance figure says how current it is. Null when any India
   * account has no update time.
   */
  updated: { oldest: string; newest: string } | null
  pctOfThreshold: number
  crossed: boolean
}

/**
 * Where the user stands against the $10,000 FBAR threshold. Pass `recorded`
 * (see `recordedFbarPeak` in lib/fbar) when balance history exists this year.
 */
export function fbarStatus(holdings: Holding[], rate: number, recorded?: RecordedFbarPeak | null): FbarStatus {
  const india = holdings.filter((h) => h.country === 'IN' && !isLiability(h))
  const currentUsd = india.reduce((s, h) => s + h.balanceInr / rate, 0)
  const peakUsd = recorded ? Math.max(recorded.usd, currentUsd) : currentUsd
  const stamps = india.map((h) => h.lastSyncedAt ?? null)
  const known = stamps.filter((s): s is string => !!s).sort()
  return {
    currentUsd,
    peakUsd,
    basis: recorded ? 'recorded' : 'current',
    since: recorded?.since ?? null,
    updated:
      known.length > 0 && known.length === stamps.length
        ? { oldest: known[0], newest: known[known.length - 1] }
        : null,
    pctOfThreshold: (peakUsd / FBAR_THRESHOLD_USD) * 100,
    crossed: peakUsd >= FBAR_THRESHOLD_USD,
  }
}

/** One plain sentence saying what the FBAR figure is and where it comes from. */
export function fbarBasisPhrase(f: FbarStatus, now: Date = new Date()): string {
  if (f.basis === 'recorded' && f.since) {
    return `Highest India balances recorded since ${shortDate(f.since, now)}: ${usd(f.peakUsd)} combined`
  }
  // Say how current "current" is: the balances as the user last entered or synced them.
  const total = `India accounts total ${usd(f.currentUsd)}`
  if (!f.updated) return `${total} at balances as entered (update date not recorded)`
  const oldest = shortDate(f.updated.oldest, now)
  const newest = shortDate(f.updated.newest, now)
  return oldest === newest
    ? `${total} at balances last updated ${oldest}`
    : `${total} at balances last updated between ${oldest} and ${newest}`
}

/** "Mar 3", or "Mar 3, 2025" outside the current year. Dates are read in UTC. */
function shortDate(iso: string, now: Date): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getUTCFullYear() !== now.getUTCFullYear() ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}

export type ComplianceLevel = 'ok' | 'attention' | 'overdue'

export interface ComplianceItem {
  key: string
  level: ComplianceLevel
  title: string
  detail: string
  meta: string
  /** Where to go to fix it — set by `withHrefs` (lib/attention-links), never by the model. */
  href?: string
}

export function complianceItems(
  holdings: Holding[],
  rate: number,
  recordedPeak?: RecordedFbarPeak | null,
): ComplianceItem[] {
  const items: ComplianceItem[] = []
  const fbar = fbarStatus(holdings, rate, recordedPeak)
  const pfics = pficHoldings(holdings)
  // FATCA reports foreign *assets*, so exclude India liabilities (use gross, not net).
  const indiaUsd = holdings
    .filter((h) => h.country === 'IN' && !isLiability(h))
    .reduce((s, h) => s + h.balanceInr / rate, 0)

  items.push({
    key: 'fbar',
    level: fbar.crossed ? 'overdue' : fbar.pctOfThreshold > 70 ? 'attention' : 'ok',
    title: 'FBAR — FinCEN 114',
    // Only what the app knows: a current balance is never called a peak.
    detail: fbar.crossed
      ? `${fbarBasisPhrase(fbar)}, above the $10,000 threshold. Filing required.`
      : fbar.basis === 'current'
        ? `${fbarBasisPhrase(fbar)}, ${Math.round(fbar.pctOfThreshold)}% of the $10,000 limit. FBAR counts each account's highest balance this year, which may be higher.`
        : `${fbarBasisPhrase(fbar)}, ${Math.round(fbar.pctOfThreshold)}% of the $10,000 limit.`,
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
  cd: 'CD',
  bond: 'Bonds',
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
  vehicle: 'Vehicle',
  notes_receivable: 'Notes Receivable',
  other: 'Other',
  notes_payable: 'Notes Payable',
  mortgage: 'Mortgage',
  heloc: 'HELOC',
  home_loan: 'Home Loan',
  auto_loan: 'Auto Loan',
  student_loan: 'Student Loan',
  education_loan: 'Education Loan',
  personal_loan: 'Personal Loan',
  credit_card: 'Credit Card',
  other_debt: 'Other Debt',
}
