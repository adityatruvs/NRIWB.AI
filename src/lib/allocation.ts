import type { AccountType } from '@/types/accounts'
import { usdValue, type Holding } from '@/lib/portfolio'

/**
 * Portfolio Analyzer engine.
 *
 * Produces an *ideal target allocation* for someone's net worth, plus the
 * machinery to compare it against what they actually hold and to let them
 * re-shape it interactively.
 *
 * Philosophy (see brainstorm): the NUMBERS are rule-based (a continuous
 * age glide-path + a risk dial), and the AI only *explains* them. We never
 * let a model invent the percentages. These are sensible starting defaults
 * the user is free to override — not financial advice.
 */

/* ── Buckets ──────────────────────────────────────────────────────────────── */

export type AllocBucket = 'stocks' | 'bonds' | 'realEstate' | 'gold' | 'cash'

/** Canonical render order (donut + legend + sliders all follow this). */
export const BUCKET_ORDER: AllocBucket[] = ['stocks', 'bonds', 'realEstate', 'gold', 'cash']

export const BUCKET_META: Record<
  AllocBucket,
  { label: string; short: string; colorVar: string }
> = {
  stocks: { label: 'Stocks', short: 'Equities & equity funds', colorVar: 'var(--brand)' },
  bonds: { label: 'Bonds & Debt', short: 'Bonds, debt funds & FDs', colorVar: 'oklch(0.55 0.18 292)' },
  realEstate: { label: 'Real Estate', short: 'Property & REITs', colorVar: 'var(--saffron)' },
  gold: { label: 'Gold & Silver', short: 'Precious metals', colorVar: 'oklch(0.80 0.13 92)' },
  cash: { label: 'Cash / HYSA', short: 'Savings & emergency fund', colorVar: 'var(--us)' },
}

export type RiskLevel =
  | 'very_conservative'
  | 'conservative'
  | 'moderate'
  | 'aggressive'
  | 'very_aggressive'

/** Risk dial, low → high. Mirrors Betterment's 5-step slider. */
export const RISK_ORDER: RiskLevel[] = [
  'very_conservative',
  'conservative',
  'moderate',
  'aggressive',
  'very_aggressive',
]

export const RISK_META: Record<RiskLevel, { label: string; short: string; adj: number }> = {
  // adj nudges the equity glide-path up/down (percentage points of total).
  very_conservative: { label: 'Very Conservative', short: 'Capital preservation', adj: -24 },
  conservative: { label: 'Conservative', short: 'Steady & cautious', adj: -12 },
  moderate: { label: 'Moderate', short: 'Balanced growth', adj: 0 },
  aggressive: { label: 'Aggressive', short: 'Growth-focused', adj: 13 },
  very_aggressive: { label: 'Very Aggressive', short: 'Maximum growth', adj: 24 },
}

export type Allocation = Record<AllocBucket, number>

/* ── helpers ──────────────────────────────────────────────────────────────── */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Buckets shown for a given mode. Excluding the home drops real estate entirely. */
export function activeBuckets(includeRealEstate: boolean): AllocBucket[] {
  return includeRealEstate ? BUCKET_ORDER : BUCKET_ORDER.filter((b) => b !== 'realEstate')
}

/* ── Recommended allocation ───────────────────────────────────────────────── */

/**
 * The ideal target split for a given age + risk appetite.
 *
 * Backbone is the classic equity glide-path (~115 − age, shifted by risk),
 * with three "satellite" buckets layered on first:
 *   • gold        — small, drifts 5→9% with age (inflation hedge)
 *   • real estate — 0 until ~28 (a down payment is out of reach before then),
 *                   ramps toward ~16%, then eases off in retirement
 *   • cash/HYSA   — the emergency buffer; higher when young (no income cushion)
 *                   and again near/into retirement
 * Whatever's left is the "risk portfolio", split stocks vs bonds by the glide.
 *
 * Returns whole-number percentages that always sum to exactly 100 across the
 * active buckets.
 */
export function recommendedAllocation(
  age: number,
  risk: RiskLevel,
  includeRealEstate: boolean,
): Allocation {
  const a = clamp(Math.round(age), 18, 100)
  const riskAdj = RISK_META[risk].adj

  const gold = clamp(Math.round(5 + (a - 25) * 0.08), 5, 9)
  const realEstate = !includeRealEstate
    ? 0
    : a < 28
      ? 0
      : clamp(Math.round((a - 26) * 0.8 - Math.max(0, a - 60) * 1.4), 0, 16)
  const cash = clamp(
    Math.round(6 + Math.max(0, 22 - a) * 0.8 + Math.max(0, a - 55) * 0.4),
    5,
    12,
  )

  // The risk portfolio is whatever the satellites leave behind.
  const remainder = 100 - gold - realEstate - cash
  const equityTarget = clamp(Math.round(115 - a + riskAdj), 10, 92)
  const stocks = clamp(equityTarget, 5, remainder)
  const bonds = Math.max(0, remainder - stocks)

  return { stocks, bonds, realEstate, gold, cash }
}

/* ── Current allocation (from real holdings) ──────────────────────────────── */

const ACCOUNT_TYPE_TO_BUCKET: Record<AccountType, AllocBucket> = {
  checking: 'cash',
  savings: 'cash',
  nre: 'cash',
  nro: 'cash',
  fcnr: 'cash',
  other: 'cash',
  brokerage: 'stocks',
  '401k': 'stocks',
  ira: 'stocks',
  roth_ira: 'stocks',
  mutual_fund: 'stocks',
  fd: 'bonds',
  real_estate: 'realEstate',
  property: 'realEstate',
  gold: 'gold',
}

export interface CurrentSlice {
  key: AllocBucket
  usd: number
  pct: number
}

export interface CurrentAllocation {
  /** One entry per active bucket, in BUCKET_ORDER. */
  slices: CurrentSlice[]
  /** Total of the analysed (investable) base in USD. */
  totalUsd: number
}

/**
 * Maps the user's real holdings into the five analyzer buckets. When the home
 * is excluded, real-estate holdings are dropped from the base entirely — we
 * only analyse what they can actually move (matches Empower / Monarch).
 */
export function currentAllocation(
  holdings: Holding[],
  rate: number,
  includeRealEstate: boolean,
): CurrentAllocation {
  const buckets = activeBuckets(includeRealEstate)
  const totals = new Map<AllocBucket, number>(buckets.map((b) => [b, 0]))

  for (const h of holdings) {
    const bucket = ACCOUNT_TYPE_TO_BUCKET[h.accountType] ?? 'cash'
    if (!includeRealEstate && bucket === 'realEstate') continue
    totals.set(bucket, (totals.get(bucket) ?? 0) + usdValue(h, rate))
  }

  const totalUsd = [...totals.values()].reduce((s, v) => s + v, 0)
  const denom = totalUsd || 1
  const slices = buckets.map((key) => {
    const usd = totals.get(key) ?? 0
    return { key, usd, pct: (usd / denom) * 100 }
  })

  return { slices, totalUsd }
}

/* ── Interactive redistribution (the "implicit pin" slider model) ─────────── */

/**
 * Recompute the split when the user drags one bucket.
 *
 * Buckets the user has already touched (`pinned`) hold their value; only the
 * untouched ones absorb the delta, proportionally to their current size. The
 * dragged bucket can't push the others below zero, so its value is capped at
 * whatever room the un-pinned buckets leave.
 *
 * Returns fractional percentages that sum to 100 across the active buckets.
 */
export function redistribute(
  values: Allocation,
  pinned: AllocBucket[],
  key: AllocBucket,
  rawValue: number,
  buckets: AllocBucket[],
): Allocation {
  const pinnedSet = new Set<AllocBucket>([...pinned, key])
  const otherPinned = [...pinnedSet].filter((k) => k !== key && buckets.includes(k))
  const sumOtherPinned = otherPinned.reduce((s, k) => s + values[k], 0)

  const auto = buckets.filter((k) => !pinnedSet.has(k))
  // If nothing is left to absorb the change, this bucket just fills the gap.
  const maxForKey = 100 - sumOtherPinned
  const v = clamp(rawValue, 0, maxForKey)

  const next: Allocation = { ...values, [key]: v }
  const remaining = Math.max(0, 100 - sumOtherPinned - v)
  const autoSum = auto.reduce((s, k) => s + values[k], 0)

  if (auto.length > 0) {
    let acc = 0
    auto.forEach((k, i) => {
      const share =
        i === auto.length - 1
          ? Math.max(0, remaining - acc)
          : autoSum > 0
            ? (values[k] / autoSum) * remaining
            : remaining / auto.length
      next[k] = share
      acc += share
    })
  }

  return next
}

/** Zero out buckets that aren't active so the record is always complete. */
export function allocationFor(rec: Allocation, buckets: AllocBucket[]): Allocation {
  const out: Allocation = { stocks: 0, bonds: 0, realEstate: 0, gold: 0, cash: 0 }
  for (const b of buckets) out[b] = rec[b]
  return out
}

/**
 * Round fractional percentages to whole numbers that still sum to exactly 100
 * across the active buckets (largest-remainder / Hamilton method). Without this
 * the displayed integers can read 99% or 101%.
 */
export function roundTo100(values: Allocation, buckets: AllocBucket[]): Allocation {
  const parts = buckets.map((b) => {
    const v = Math.max(0, values[b])
    return { b, floor: Math.floor(v), rem: v - Math.floor(v) }
  })
  const used = parts.reduce((s, p) => s + p.floor, 0)
  let left = Math.round(100 - used) // how many buckets get a +1 bump
  const order = [...parts].sort((a, b) => b.rem - a.rem)
  const bumped = new Set<AllocBucket>()
  for (const p of order) {
    if (left <= 0) break
    bumped.add(p.b)
    left--
  }
  const out: Allocation = { stocks: 0, bonds: 0, realEstate: 0, gold: 0, cash: 0 }
  for (const p of parts) out[p.b] = p.floor + (bumped.has(p.b) ? 1 : 0)
  return out
}

/* ── Projections (à la Betterment's goal forecaster) ──────────────────────── */

/**
 * Long-run *nominal* annual return assumptions per bucket. Deliberately
 * conservative, round numbers — these drive an illustrative projection, not a
 * promise. Roughly: equities ~8.5%, real estate ~6%, gold ~4%, bonds ~3.5%,
 * cash/HYSA ~3%.
 */
export const EXPECTED_RETURN: Record<AllocBucket, number> = {
  stocks: 0.085,
  bonds: 0.035,
  realEstate: 0.06,
  gold: 0.04,
  cash: 0.03,
}

/** Weighted average expected return of an allocation (percentages → fraction). */
export function blendedReturn(alloc: Allocation): number {
  return BUCKET_ORDER.reduce((s, b) => s + (alloc[b] / 100) * EXPECTED_RETURN[b], 0)
}

/** Illustrative future value of `baseUsd` invested at `alloc` for `years`. */
export function projectValue(alloc: Allocation, baseUsd: number, years: number): number {
  return BUCKET_ORDER.reduce(
    (s, b) => s + baseUsd * (alloc[b] / 100) * Math.pow(1 + EXPECTED_RETURN[b], years),
    0,
  )
}

/* ── Risk-vs-age sanity feedback (à la Betterment's "too aggressive") ─────── */

export interface RiskFeedback {
  tone: 'ok' | 'caution'
  text: string
}

/**
 * Gentle nudge when the chosen risk level looks off for the age — never blocks,
 * just informs (it's their portfolio).
 */
export function riskFeedback(age: number, risk: RiskLevel): RiskFeedback {
  const chosen = RISK_ORDER.indexOf(risk)
  // The "natural" risk level drops as age rises.
  const expected = age < 35 ? 3 : age < 50 ? 2 : age < 62 ? 2 : 1
  if (chosen >= expected + 2) {
    return {
      tone: 'caution',
      text: `That's quite aggressive for ${age} — a market dip could hit harder than you'd like.`,
    }
  }
  if (chosen <= expected - 2) {
    return {
      tone: 'caution',
      text: `Fairly cautious for ${age} — you may be leaving long-term growth on the table.`,
    }
  }
  return { tone: 'ok', text: `A sensible fit for someone around ${age}.` }
}
