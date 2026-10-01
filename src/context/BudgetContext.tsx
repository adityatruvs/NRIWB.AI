'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useAccounts } from '@/context/AccountsContext'
import {
  BUDGET_COLORS,
  STARTER_BUDGET,
  type Budget,
  type BudgetCategory,
} from '@/lib/budget'

export { BUDGET_COLORS, type BudgetCategory }

interface BudgetContextValue {
  /** Monthly income in USD — the single source of truth shared across the app. */
  income: number
  categories: BudgetCategory[]
  /** True until the first server load resolves. */
  loading: boolean
  setIncome: (n: number) => void
  addCategory: (c: Omit<BudgetCategory, 'id'>) => void
  updateCategory: (id: string, patch: Partial<BudgetCategory>) => void
  removeCategory: (id: string) => void
  /** Set when a save failed and the change was rolled back. */
  saveError: string | null
  clearSaveError: () => void
}

const BudgetContext = createContext<BudgetContextValue | null>(null)

// Where the budget lived before it was persisted — imported once, then cleared.
const budgetKeyFor = (userId: string) => `nriwb:budget:${userId}`
// Pre-scoping keys — cleared on mount so stale globals can't leak across users.
const LEGACY_BUDGET_KEY = 'nriwb:budget'
const LEGACY_INCOME_KEY = 'nriwb:monthly-income'

// Typing in an amount field saves at most once per this window.
const SAVE_DEBOUNCE_MS = 500

async function putBudget(budget: Budget, keepalive = false): Promise<Budget> {
  const res = await fetch('/api/budget', {
    method: 'PUT',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(budget),
  })
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error
    throw new Error(detail ?? `PUT /api/budget ${res.status}`)
  }
  return ((await res.json()) as { budget: Budget }).budget
}

/** A budget read from the pre-persistence localStorage shape, or null. */
function readLocal(raw: string | null): Budget | null {
  try {
    const parsed = raw ? (JSON.parse(raw) as { income?: unknown; categories?: unknown }) : null
    if (!parsed) return null
    return {
      incomeUsd: typeof parsed.income === 'number' && parsed.income > 0 ? parsed.income : 0,
      categories: Array.isArray(parsed.categories)
        ? (parsed.categories as BudgetCategory[])
        : STARTER_BUDGET.categories,
    }
  } catch {
    return null
  }
}

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const { demo } = useAccounts()
  const { isLoaded, user } = useUser()
  const userId = user?.id ?? null

  const [budget, setBudget] = useState<Budget>(STARTER_BUDGET)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  const budgetRef = useRef(budget)
  useEffect(() => {
    budgetRef.current = budget
  }, [budget])

  // The last budget the server confirmed — what a failed save rolls back to.
  const confirmed = useRef<Budget>(STARTER_BUDGET)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const chain = useRef<Promise<void>>(Promise.resolve())
  // Bumped on user switch / demo toggle so a late failure can't restore stale data.
  const epoch = useRef(0)

  const flush = useCallback((keepalive = false) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!dirty.current) return
    dirty.current = false
    const at = epoch.current
    const sent = budgetRef.current
    // Saves run one at a time so an older PUT can never land after a newer one.
    chain.current = chain.current.then(() => putBudget(sent, keepalive)).then(
      (saved) => {
        if (at === epoch.current) confirmed.current = saved
      },
      (e: Error) => {
        console.error('Failed to save budget:', e)
        if (at !== epoch.current) return
        setBudget(confirmed.current)
        setSaveError(`Couldn't save your budget, so the change was undone. ${e.message}`)
      },
    )
  }, [])

  useEffect(() => {
    const onHide = () => flush(true)
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [flush])

  useEffect(() => {
    if (!isLoaded) return
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LEGACY_BUDGET_KEY)
      localStorage.removeItem(LEGACY_INCOME_KEY)
    }
    epoch.current++
    if (timer.current) clearTimeout(timer.current)
    dirty.current = false

    // Demo is client-only: the $0 template, never saved.
    if (demo || !userId) {
      setBudget(STARTER_BUDGET)
      setLoading(false)
      return
    }

    let current = true
    const at = epoch.current
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch('/api/budget')
        if (!res.ok) throw new Error(`GET /api/budget ${res.status}`)
        const data = (await res.json()) as { budget: Budget; saved: boolean }
        if (!current) return
        let loaded = data.budget

        // One-time import: only when the server has nothing yet, so it can never
        // overwrite a budget saved from another device.
        const key = budgetKeyFor(userId)
        const local = readLocal(localStorage.getItem(key))
        if (!data.saved && local) {
          loaded = await putBudget(local)
          if (!current) return
        }
        localStorage.removeItem(key)

        confirmed.current = loaded
        setBudget(loaded)
      } catch (e) {
        console.error('Failed to load budget:', e)
        if (current && at === epoch.current) setBudget(STARTER_BUDGET)
      } finally {
        if (current) setLoading(false)
      }
    })()
    return () => {
      current = false
    }
  }, [isLoaded, userId, demo])

  const persist = !demo && !!userId

  /** Apply an edit locally and schedule a debounced save of the whole budget. */
  const edit = useCallback(
    (fn: (b: Budget) => Budget) => {
      setBudget((prev) => {
        const next = fn(prev)
        budgetRef.current = next
        return next
      })
      if (!persist) return
      dirty.current = true
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => flush(), SAVE_DEBOUNCE_MS)
    },
    [persist, flush],
  )

  const clearSaveError = useCallback(() => setSaveError(null), [])

  const value: BudgetContextValue = {
    income: budget.incomeUsd,
    categories: budget.categories,
    loading,
    setIncome: (n) =>
      edit((b) => ({ ...b, incomeUsd: Number.isFinite(n) && n > 0 ? Math.round(n) : 0 })),
    addCategory: (c) =>
      edit((b) => ({ ...b, categories: [...b.categories, { ...c, id: crypto.randomUUID() }] })),
    updateCategory: (id, patch) =>
      edit((b) => ({
        ...b,
        categories: b.categories.map((c) => (c.id === id ? { ...c, ...patch, id } : c)),
      })),
    removeCategory: (id) =>
      edit((b) => ({ ...b, categories: b.categories.filter((c) => c.id !== id) })),
    saveError,
    clearSaveError,
  }

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
}

export function useBudget() {
  const ctx = useContext(BudgetContext)
  if (!ctx) throw new Error('useBudget must be used within BudgetProvider')
  return ctx
}
