/**
 * Goals engine.
 *
 * A goal is a target amount (in USD) you're saving toward by a target year.
 * Everything here is rule-based and source-of-truth-free: the numbers come
 * from the user, and these helpers only derive progress + a rough monthly
 * contribution. Goals live in client state (GoalsContext) for now, mirroring
 * the way accounts are held — no DB round-trip in the demo.
 */

import { usdValue, type Holding } from '@/lib/portfolio'

export type GoalCategory =
  | 'retirement'
  | 'education'
  | 'property'
  | 'travel'
  | 'emergency'
  | 'other'

/** Canonical render order for pickers + legends. */
export const GOAL_CATEGORY_ORDER: GoalCategory[] = [
  'retirement',
  'education',
  'property',
  'travel',
  'emergency',
  'other',
]

export const GOAL_CATEGORY_META: Record<
  GoalCategory,
  { label: string; accent: string }
> = {
  retirement: { label: 'Retirement', accent: 'var(--brand)' },
  education: { label: 'Education', accent: 'var(--us)' },
  property: { label: 'Property', accent: 'var(--saffron)' },
  travel: { label: 'Travel', accent: 'oklch(0.62 0.13 300)' },
  emergency: { label: 'Emergency Fund', accent: 'var(--india)' },
  other: { label: 'Other', accent: 'oklch(0.6 0.14 200)' },
}

/**
 * Whether reaching a goal *spends* money (a cost — education, travel: it leaves
 * your wealth) or *converts* it (an investment — property, the retirement pot:
 * it stays your wealth in another form). Drives whether the lifetime projection
 * dips for it.
 */
export type GoalKind = 'cost' | 'investment'

/** Sensible default kind per category; the user can override per goal. */
const DEFAULT_KIND: Record<GoalCategory, GoalKind> = {
  retirement: 'investment',
  education: 'cost',
  property: 'investment',
  travel: 'cost',
  emergency: 'investment',
  other: 'cost',
}

export interface Goal {
  /** Stable identity for edit/remove. Assigned by GoalsContext when added. */
  id: string
  name: string
  category: GoalCategory
  targetUsd: number
  currentUsd: number
  targetYear: number
  /** Cost (spent → dips the projection) vs investment (stays your wealth). */
  kind?: GoalKind
  /**
   * Real account ids (from AccountsContext holdings) earmarked to this goal.
   * When set, the goal's funded amount is derived live from those balances
   * instead of the manual `currentUsd`. Each account funds at most one goal.
   */
  linkedAccountIds?: string[]
}

/** True when the goal draws its funded amount from linked accounts. */
export function isGoalLinked(g: Goal): boolean {
  return !!g.linkedAccountIds && g.linkedAccountIds.length > 0
}

/** Live USD value of the accounts earmarked to a goal (0 if none/missing). */
export function goalLinkedUsd(g: Goal, holdings: Holding[], rate: number): number {
  if (!g.linkedAccountIds?.length) return 0
  const ids = new Set(g.linkedAccountIds)
  return holdings
    .filter((h) => h.id && ids.has(h.id))
    .reduce((s, h) => s + usdValue(h, rate), 0)
}

/**
 * The goal with its funded amount resolved: derived live from linked accounts
 * when any are linked, otherwise the manually-entered `currentUsd`. Use this for
 * all display/progress so a linked goal always mirrors the real accounts.
 */
export function resolveGoal(g: Goal, holdings: Holding[], rate: number): Goal {
  if (!isGoalLinked(g)) return g
  return { ...g, currentUsd: goalLinkedUsd(g, holdings, rate) }
}

/** Resolve a goal's kind (explicit override, else the category default). */
export function goalKind(g: Goal): GoalKind {
  return g.kind ?? DEFAULT_KIND[g.category]
}

/** The default kind for a category (used to prefill the goal form). */
export function defaultGoalKind(category: GoalCategory): GoalKind {
  return DEFAULT_KIND[category]
}

/** Accent colour for a goal, derived from its category. */
export function goalAccent(g: Goal): string {
  return GOAL_CATEGORY_META[g.category].accent
}

/** Completion as a 0..1 fraction (clamped). */
export function goalProgress(g: Goal): number {
  if (g.targetUsd <= 0) return 0
  return Math.max(0, Math.min(g.currentUsd / g.targetUsd, 1))
}

/** Dollars still to go (never negative). */
export function goalRemaining(g: Goal): number {
  return Math.max(0, g.targetUsd - g.currentUsd)
}

/**
 * Monthly contribution needed to reach the target by its year — crediting both
 * the money already saved *and* the growth it (plus future contributions) earns
 * along the way. Solves the annuity payment that closes the gap:
 *
 *   target = saved·(1+r)^n  +  PMT·((1+r)^n − 1)/r
 *
 * where r is the monthly return and n the months left. Returns 0 once the goal
 * is met, its year has passed, or the existing savings alone will get there.
 * Illustrative, not a financial projection.
 */
export function goalMonthlyNeeded(
  g: Goal,
  currentYear: number,
  annualReturn = 0.06,
): number {
  const months = (g.targetYear - currentYear) * 12
  if (months <= 0) return 0
  const r = annualReturn / 12
  // What the money already invested grows to on its own by the target year.
  const grown = g.currentUsd * Math.pow(1 + r, months)
  const gap = g.targetUsd - grown
  if (gap <= 0) return 0 // current savings + growth already clear the target
  if (r <= 0) return gap / months
  const annuityFactor = (Math.pow(1 + r, months) - 1) / r
  return gap / annuityFactor
}

/* ── Seed goals (demo) ────────────────────────────────────────────────────── */
// Mirrors the original mock so the dashboard tells the same story out of the box.
export const SEED_GOALS: Goal[] = [
  {
    id: 'goal-0',
    name: 'Retirement',
    category: 'retirement',
    targetUsd: 2_000_000,
    currentUsd: 1_020_000,
    targetYear: 2041,
  },
  {
    id: 'goal-1',
    name: "Child's Education",
    category: 'education',
    targetUsd: 250_000,
    currentUsd: 96_000,
    targetYear: 2035,
  },
  {
    id: 'goal-2',
    name: 'India Property',
    category: 'property',
    targetUsd: 180_000,
    currentUsd: 132_000,
    targetYear: 2029,
  },
]
