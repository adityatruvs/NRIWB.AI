/**
 * Budget shape and helpers. Pure and dependency-free so the client context and
 * the server (the /api/budget route, the Copilot context loader) share it.
 */

export interface BudgetCategory {
  id: string
  label: string
  /** Monthly amount in USD. */
  amount: number
  color: string
}

export interface Budget {
  /** Monthly income in USD. */
  incomeUsd: number
  categories: BudgetCategory[]
}

/** Preset swatches for budget categories (coordinated with the app palette). */
export const BUDGET_COLORS = [
  'oklch(0.55 0.13 162)', // emerald
  'oklch(0.55 0.15 252)', // blue
  'oklch(0.55 0.18 292)', // violet
  'oklch(0.74 0.14 70)', // amber
  'oklch(0.63 0.17 12)', // rose
  'oklch(0.64 0.11 195)', // teal
  'oklch(0.7 0.16 330)', // pink
  'oklch(0.58 0.02 260)', // slate
]

// Starter category labels (all $0 — a template, not fabricated spend).
export const STARTER_CATEGORIES: BudgetCategory[] = [
  { id: 'seed-rent', label: 'Rent / Mortgage', amount: 0, color: BUDGET_COLORS[1] },
  { id: 'seed-invest', label: 'Investments', amount: 0, color: BUDGET_COLORS[0] },
  { id: 'seed-grocery', label: 'Groceries', amount: 0, color: BUDGET_COLORS[3] },
  { id: 'seed-shopping', label: 'Shopping', amount: 0, color: BUDGET_COLORS[2] },
]

export const STARTER_BUDGET: Budget = { incomeUsd: 0, categories: STARTER_CATEGORIES }

/**
 * Monthly investing = the sum of the budget lines labelled "invest…". One
 * definition shared by the Analyzer, the Copilot (client and server) and goals.
 */
export function monthlyContribution(categories: Pick<BudgetCategory, 'label' | 'amount'>[]): number {
  return categories
    .filter((c) => /invest/i.test(c.label))
    .reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0)
}
