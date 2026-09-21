'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { SEED_GOALS, type Goal } from '@/lib/goals'
import { useAccounts } from '@/context/AccountsContext'

interface GoalsContextValue {
  /** All goals (seed + user-added), each with a stable `id`. */
  goals: Goal[]
  addGoal: (goal: Omit<Goal, 'id'>) => void
  /** Replace the goal with this id (keeps its id and position in the list). */
  updateGoal: (id: string, goal: Omit<Goal, 'id'>) => void
  removeGoal: (id: string) => void
}

const GoalsContext = createContext<GoalsContextValue | null>(null)

// Persisted PER USER, mirroring accounts — one person's goals must never show up
// under another sign-in on a shared browser. The demo seed is shown only in demo
// mode; real users start with an empty goal list.
const goalsKeyFor = (userId: string) => `nriwb:goals:${userId}`
// Pre-scoping key — cleared on mount so a stale global list can't leak across users.
const LEGACY_GOALS_KEY = 'nriwb:goals'

export function GoalsProvider({ children }: { children: React.ReactNode }) {
  // Demo mode (shared with accounts) decides seed vs. real; the user id scopes storage.
  const { demo } = useAccounts()
  const { isLoaded, user } = useUser()
  const userId = user?.id ?? null

  // SSR-safe: start empty. Real users begin with a blank slate; the seed only
  // loads in demo mode (below).
  const [goals, setGoals] = useState<Goal[]>([])

  // Suppresses the persist effect during the load/hydration swap so loading a
  // user's goals doesn't immediately write them back (and clobber on user switch).
  const persistReady = useRef(false)

  // Load whenever the user or demo mode changes: demo → seed; real user → their
  // own saved goals; signed out → empty.
  useEffect(() => {
    if (!isLoaded) return // wait for Clerk before deciding seed vs. server

    // Drop any pre-scoping global list so it can never bleed across users.
    if (typeof window !== 'undefined') localStorage.removeItem(LEGACY_GOALS_KEY)

    persistReady.current = false // the upcoming setGoals is hydration, not a user edit

    if (demo) {
      setGoals(SEED_GOALS)
      return
    }
    if (!userId) {
      setGoals([])
      return
    }
    try {
      const raw = localStorage.getItem(goalsKeyFor(userId))
      const parsed = raw ? JSON.parse(raw) : null
      setGoals(Array.isArray(parsed) ? parsed : [])
    } catch {
      setGoals([])
    }
  }, [isLoaded, userId, demo])

  // Persist real users' goals to their scoped key. Never persist the demo seed.
  useEffect(() => {
    if (!persistReady.current) {
      persistReady.current = true
      return
    }
    if (demo || !userId) return
    try {
      localStorage.setItem(goalsKeyFor(userId), JSON.stringify(goals))
    } catch {
      /* ignore */
    }
  }, [goals, demo, userId])

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
