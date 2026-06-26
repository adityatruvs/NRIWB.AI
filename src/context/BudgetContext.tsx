'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'

export interface BudgetCategory {
  id: string
  label: string
  /** Monthly amount in USD. */
  amount: number
  color: string
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

interface BudgetContextValue {
  /** Monthly income in USD — the single source of truth shared across the app. */
  income: number
  categories: BudgetCategory[]
  setIncome: (n: number) => void
  addCategory: (c: Omit<BudgetCategory, 'id'>) => void
  updateCategory: (id: string, patch: Partial<BudgetCategory>) => void
  removeCategory: (id: string) => void
}

const BudgetContext = createContext<BudgetContextValue | null>(null)

const SEED: BudgetCategory[] = [
  { id: 'seed-rent', label: 'Rent / Mortgage', amount: 0, color: BUDGET_COLORS[1] },
  { id: 'seed-invest', label: 'Investments', amount: 0, color: BUDGET_COLORS[0] },
  { id: 'seed-grocery', label: 'Groceries', amount: 0, color: BUDGET_COLORS[3] },
  { id: 'seed-shopping', label: 'Shopping', amount: 0, color: BUDGET_COLORS[2] },
]

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [income, setIncomeState] = useState(0)
  const [categories, setCategories] = useState<BudgetCategory[]>(SEED)

  // Persist so the budget + income survive reloads and stay consistent across
  // every page. Start from the seed (SSR-safe), then hydrate after mount.
  const persistReady = useRef(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nriwb:budget')
      if (raw) {
        const parsed = JSON.parse(raw) as { income?: number; categories?: BudgetCategory[] }
        if (typeof parsed.income === 'number') setIncomeState(parsed.income)
        if (Array.isArray(parsed.categories)) setCategories(parsed.categories)
      } else {
        // Migrate the standalone income the analyzer used to store.
        const legacy = localStorage.getItem('nriwb:monthly-income')
        if (legacy) setIncomeState(Number(legacy) || 0)
      }
    } catch {
      /* ignore */
    }
  }, [])
  useEffect(() => {
    if (!persistReady.current) {
      persistReady.current = true
      return
    }
    try {
      localStorage.setItem('nriwb:budget', JSON.stringify({ income, categories }))
    } catch {
      /* ignore */
    }
  }, [income, categories])

  const value: BudgetContextValue = {
    income,
    categories,
    setIncome: (n) => setIncomeState(Number.isFinite(n) && n > 0 ? Math.round(n) : 0),
    addCategory: (c) => setCategories((prev) => [...prev, { ...c, id: crypto.randomUUID() }]),
    updateCategory: (id, patch) =>
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    removeCategory: (id) => setCategories((prev) => prev.filter((c) => c.id !== id)),
  }

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
}

export function useBudget() {
  const ctx = useContext(BudgetContext)
  if (!ctx) throw new Error('useBudget must be used within BudgetProvider')
  return ctx
}
