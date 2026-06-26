'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { SEED_GOALS, type Goal } from '@/lib/goals'

interface GoalsContextValue {
  /** All goals (seed + user-added), each with a stable `id`. */
  goals: Goal[]
  addGoal: (goal: Omit<Goal, 'id'>) => void
  /** Replace the goal with this id (keeps its id and position in the list). */
  updateGoal: (id: string, goal: Omit<Goal, 'id'>) => void
  removeGoal: (id: string) => void
}

const GoalsContext = createContext<GoalsContextValue | null>(null)

export function GoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>(SEED_GOALS)

  // Persist so goal edits survive reloads and stay consistent everywhere
  // (dashboard, goals page, and the analyzer's lifetime projection).
  const persistReady = useRef(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nriwb:goals')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setGoals(parsed)
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
      localStorage.setItem('nriwb:goals', JSON.stringify(goals))
    } catch {
      /* ignore */
    }
  }, [goals])

  // An account funds at most one goal: whenever a goal claims account ids, strip
  // those ids from every *other* goal so balances are never double-counted.
  const releaseElsewhere = (list: Goal[], keepId: string, claimed?: string[]): Goal[] => {
    if (!claimed?.length) return list
    const taken = new Set(claimed)
    return list.map((g) =>
      g.id === keepId || !g.linkedAccountIds?.length
        ? g
        : { ...g, linkedAccountIds: g.linkedAccountIds.filter((i) => !taken.has(i)) },
    )
  }

  const value: GoalsContextValue = {
    goals,
    addGoal: (goal) =>
      setGoals((prev) => {
        const id = crypto.randomUUID()
        return [...releaseElsewhere(prev, id, goal.linkedAccountIds), { ...goal, id }]
      }),
    updateGoal: (id, goal) =>
      setGoals((prev) =>
        releaseElsewhere(prev, id, goal.linkedAccountIds).map((g) =>
          g.id === id ? { ...goal, id } : g,
        ),
      ),
    removeGoal: (id) => setGoals((prev) => prev.filter((g) => g.id !== id)),
  }

  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>
}

export function useGoals() {
  const ctx = useContext(GoalsContext)
  if (!ctx) throw new Error('useGoals must be used within GoalsProvider')
  return ctx
}
