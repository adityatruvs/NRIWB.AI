'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { SEED_GOALS, releaseClaims, type Goal } from '@/lib/goals'
import { useAccounts } from '@/context/AccountsContext'

interface GoalsContextValue {
  /** The user's goals (from the server), or the demo seed in demo mode. */
  goals: Goal[]
  /** True until the first server load resolves. */
  loading: boolean
  addGoal: (goal: Omit<Goal, 'id'>) => void
  /** Replace the goal with this id (keeps its id and position in the list). */
  updateGoal: (id: string, goal: Omit<Goal, 'id'>) => void
  removeGoal: (id: string) => void
  /** Set when a save failed and the change was rolled back. */
  saveError: string | null
  clearSaveError: () => void
}

const GoalsContext = createContext<GoalsContextValue | null>(null)

// Where goals lived before they were persisted — read once, imported, then cleared.
const goalsKeyFor = (userId: string) => `nriwb:goals:${userId}`
// Pre-scoping key — cleared on mount so a stale global list can't leak across users.
const LEGACY_GOALS_KEY = 'nriwb:goals'

// Edits are coalesced per goal: the Analyzer rewrites the retirement target on
// every keystroke, which should be one PATCH, not one per character.
const SAVE_DEBOUNCE_MS = 400

/** The /api/goals body for a goal. Full-replace semantics: nulls clear. */
function goalBody(g: Omit<Goal, 'id'>) {
  return {
    name: g.name,
    category: g.category,
    kind: g.kind ?? null,
    targetUsd: g.targetUsd,
    currentUsd: g.currentUsd,
    targetYear: g.targetYear,
    linkedAccountIds: g.linkedAccountIds ?? [],
    plannedMonthlyUsd: g.plannedMonthlyUsd ?? null,
    linkedLiabilityId: g.linkedLiabilityId ?? null,
    originalAmount: g.originalAmount ?? null,
  }
}

async function send(url: string, method: string, body?: unknown, keepalive = false) {
  const res = await fetch(url, {
    method,
    keepalive,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error
    throw new Error(detail ?? `${method} ${url} ${res.status}`)
  }
  return res.json()
}

/** Apply a goal write locally, releasing its accounts from every other goal. */
function withClaims(list: Goal[], id: string, claimed?: string[]): Goal[] {
  const released = new Map(releaseClaims(list, id, claimed).map((g) => [g.id, g.linkedAccountIds]))
  if (released.size === 0) return list
  return list.map((g) => (released.has(g.id) ? { ...g, linkedAccountIds: released.get(g.id) } : g))
}

export function GoalsProvider({ children }: { children: React.ReactNode }) {
  // Demo mode (shared with accounts) decides seed vs. real; the user id scopes storage.
  const { demo, onRemoved } = useAccounts()
  const { isLoaded, user } = useUser()
  const userId = user?.id ?? null

  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Live mirror of `goals` so handlers can snapshot the pre-change state for rollback.
  const goalsRef = useRef<Goal[]>(goals)
  useEffect(() => {
    goalsRef.current = goals
  }, [goals])

  // Requests for one goal run in order (create → patch → delete), so a PATCH can
  // never overtake the POST that creates the row.
  const chains = useRef(new Map<string, Promise<void>>())
  const enqueue = useCallback((id: string, task: () => Promise<void>) => {
    const next = (chains.current.get(id) ?? Promise.resolve()).then(task)
    chains.current.set(id, next)
  }, [])

  // Debounced edits: the latest body per goal, its timer, and the list as it
  // was before the burst of edits began (what a failure rolls back to).
  const pending = useRef(
    new Map<string, { body: ReturnType<typeof goalBody>; snapshot: Goal[]; epoch: number }>(),
  )
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Bumped whenever the loaded data set changes (user switch, demo toggle). A
  // failure from an older epoch is logged but never rolls back into the new one —
  // that would put the previous user's goals on screen.
  const epoch = useRef(0)

  const fail = useCallback((what: string, e: unknown, snapshot: Goal[], at: number) => {
    console.error(`Failed to ${what} goal:`, e)
    if (at !== epoch.current) return
    setGoals(snapshot)
    setSaveError(`Couldn't ${what} your goal, so the change was undone. ${(e as Error).message ?? ''}`.trim())
  }, [])

  const flush = useCallback(
    (id: string, keepalive = false) => {
      clearTimeout(timers.current.get(id))
      timers.current.delete(id)
      const edit = pending.current.get(id)
      if (!edit) return
      pending.current.delete(id)
      enqueue(id, () =>
        send(`/api/goals/${id}`, 'PATCH', edit.body, keepalive).then(
          () => undefined,
          (e) => fail('save', e, edit.snapshot, edit.epoch),
        ),
      )
    },
    [enqueue, fail],
  )

  // Don't lose an edit still waiting out its debounce when the tab closes.
  useEffect(() => {
    const flushAll = () => Array.from(pending.current.keys()).forEach((id) => flush(id, true))
    window.addEventListener('pagehide', flushAll)
    return () => window.removeEventListener('pagehide', flushAll)
  }, [flush])

  const loadFromServer = useCallback(async (uid: string, isCurrent: () => boolean) => {
    setLoading(true)
    try {
      const data = (await send('/api/goals', 'GET')) as { goals: Goal[] }
      if (!isCurrent()) return
      setGoals(data.goals)

      // One-time import of goals saved in this browser before persistence. The
      // server skips goals it already has, so a retry after a failure is safe.
      const key = goalsKeyFor(uid)
      const raw = localStorage.getItem(key)
      let local: unknown = null
      try {
        local = raw ? JSON.parse(raw) : null
      } catch {
        /* unreadable — treated as nothing to import */
      }
      if (Array.isArray(local) && local.length > 0) {
        const imported = (await send('/api/goals/import', 'POST', { goals: local })) as { goals: Goal[] }
        if (!isCurrent()) return
        setGoals(imported.goals)
      }
      localStorage.removeItem(key)
    } catch (e) {
      console.error('Failed to load goals:', e)
      if (isCurrent()) setGoals([])
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [])

  // Load whenever the user or demo mode changes: demo → seed; real user → their
  // goals from the server; signed out → empty.
  useEffect(() => {
    if (!isLoaded) return
    if (typeof window !== 'undefined') localStorage.removeItem(LEGACY_GOALS_KEY)
    epoch.current++

    if (demo) {
      setGoals(SEED_GOALS)
      setLoading(false)
      return
    }
    if (!userId) {
      setGoals([])
      setLoading(false)
      return
    }
    let current = true
    void loadFromServer(userId, () => current)
    return () => {
      current = false
    }
  }, [isLoaded, userId, demo, loadFromServer])

  // A deleted account stops funding its goal (the server unlinks it too).
  useEffect(
    () =>
      onRemoved((ids) => {
        const gone = new Set(ids)
        setGoals((prev) =>
          prev.map((g) => {
            let next = g
            if (g.linkedAccountIds?.some((i) => gone.has(i)))
              next = { ...next, linkedAccountIds: g.linkedAccountIds.filter((i) => !gone.has(i)) }
            if (g.linkedLiabilityId && gone.has(g.linkedLiabilityId)) {
              const { linkedLiabilityId: _removed, ...rest } = next
              next = rest
            }
            return next
          }),
        )
      }),
    [onRemoved],
  )

  const persist = !demo && !!userId

  const addGoal = useCallback(
    (goal: Omit<Goal, 'id'>) => {
      const id = crypto.randomUUID()
      const snapshot = goalsRef.current
      const at = epoch.current
      setGoals((prev) => [...withClaims(prev, id, goal.linkedAccountIds), { ...goal, id }])
      if (!persist) return
      enqueue(id, () =>
        send('/api/goals', 'POST', { id, ...goalBody(goal) }).then(
          () => undefined,
          (e) => fail('add', e, snapshot, at),
        ),
      )
    },
    [persist, enqueue, fail],
  )

  const updateGoal = useCallback(
    (id: string, goal: Omit<Goal, 'id'>) => {
      const snapshot = pending.current.get(id)?.snapshot ?? goalsRef.current
      setGoals((prev) => withClaims(prev, id, goal.linkedAccountIds).map((g) => (g.id === id ? { ...goal, id } : g)))
      if (!persist) return
      pending.current.set(id, { body: goalBody(goal), snapshot, epoch: epoch.current })
      clearTimeout(timers.current.get(id))
      timers.current.set(id, setTimeout(() => flush(id), SAVE_DEBOUNCE_MS))
    },
    [persist, flush],
  )

  const removeGoal = useCallback(
    (id: string) => {
      // A pending edit is moot once the goal is gone; roll back to before it.
      const snapshot = pending.current.get(id)?.snapshot ?? goalsRef.current
      const at = epoch.current
      clearTimeout(timers.current.get(id))
      timers.current.delete(id)
      pending.current.delete(id)
      setGoals((prev) => prev.filter((g) => g.id !== id))
      if (!persist) return
      enqueue(id, () =>
        send(`/api/goals/${id}`, 'DELETE').then(
          () => undefined,
          (e) => fail('delete', e, snapshot, at),
        ),
      )
    },
    [persist, enqueue, fail],
  )

  const clearSaveError = useCallback(() => setSaveError(null), [])

  const value: GoalsContextValue = {
    goals,
    loading,
    addGoal,
    updateGoal,
    removeGoal,
    saveError,
    clearSaveError,
  }

  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>
}

export function useGoals() {
  const ctx = useContext(GoalsContext)
  if (!ctx) throw new Error('useGoals must be used within GoalsProvider')
  return ctx
}
