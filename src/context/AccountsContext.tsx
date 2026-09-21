'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { MOCK_ACCOUNTS } from '@/data/mock/accounts'
import { isLiability, type Holding } from '@/lib/portfolio'

interface AccountsContextValue {
  /** The user's holdings — loaded from the server (or the demo seed when in demo mode). */
  holdings: Holding[]
  /** True until the first server load resolves — drives loading skeletons. */
  loading: boolean
  /** True while showing the opt-in demo seed instead of the user's real, persisted data. */
  demo: boolean
  hasLinked: boolean
  /** Merge accounts the server just persisted (e.g. a Plaid link) into the ledger. */
  addLinked: (accounts: Holding[]) => void
  clearLinked: () => void
  addManual: (account: Holding) => void
  /** Replace the holding with this id (keeps its id and position in the list). */
  updateAccount: (id: string, account: Holding) => void
  removeAccount: (id: string) => void
  /** Re-fetch the ledger from the server (e.g. after a balance sync). */
  refresh: () => Promise<void>
  /** Load the sample portfolio (client-only — never written to the user's real ledger). */
  loadDemoData: () => void
  /** Leave demo mode and return to the user's real (server) data. */
  exitDemo: () => void
}

const AccountsContext = createContext<AccountsContextValue | null>(null)

// localStorage flag so the demo toggle survives a reload (it's a mode, not a one-off).
// Keyed PER USER: two people sharing a browser must never inherit each other's demo
// mode (which would show the mock seed instead of their own real, empty ledger).
const demoKeyFor = (userId: string) => `nriwb:demo:${userId}`
// Pre-scoping key — cleared on mount so a stale global flag can't leak across users.
const LEGACY_DEMO_KEY = 'nriwb:demo'

// Deterministic ids for the seed set keep the demo overlay stable across renders.
const SEED_HOLDINGS: Holding[] = MOCK_ACCOUNTS.map((a, i) => ({
  id: `seed-${i}`,
  nickname: a.nickname,
  institution: a.institution,
  accountType: a.accountType,
  country: a.country,
  balanceUsd: a.balanceUsd,
  balanceInr: a.balanceInr,
  isPfic: a.isPfic,
  source: a.source,
}))

/** The subset of a Holding the /api/accounts body accepts (id + client-only fields dropped). */
function createBody(h: Holding) {
  const body: Record<string, unknown> = {
    nickname: h.nickname,
    institution: h.institution,
    accountType: h.accountType,
    country: h.country,
    balanceUsd: h.balanceUsd,
    balanceInr: h.balanceInr,
    isPfic: h.isPfic,
    source: h.source,
    kind: h.kind ?? (isLiability(h) ? 'liability' : 'asset'),
  }
  if (h.securedAgainstId) body.securedAgainstId = h.securedAgainstId
  if (h.details) body.details = h.details
  return body
}

/** PATCH body: like create, but nulls explicitly clear a dropped link / details (replace semantics). */
function updateBody(h: Holding) {
  return {
    ...createBody(h),
    securedAgainstId: h.securedAgainstId ?? null,
    details: h.details ?? null,
  }
}

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  // SSR-safe: start empty + loading. The seed no longer auto-loads — real users
  // begin with a blank ledger and either add accounts or opt into demo data.
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [demo, setDemo] = useState(false)

  // The authenticated user scopes both the demo flag and the server ledger.
  // `isLoaded` gates the mount effect so we don't decide before Clerk resolves.
  const { isLoaded, user } = useUser()
  const userId = user?.id ?? null

  // A live mirror of `holdings` so async handlers can snapshot the pre-change
  // state for rollback without re-subscribing to every render.
  const holdingsRef = useRef<Holding[]>(holdings)
  useEffect(() => {
    holdingsRef.current = holdings
  }, [holdings])

  // Fetch the user's real ledger from the server.
  const loadFromServer = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error(`GET /api/accounts ${res.status}`)
      const data = (await res.json()) as { accounts?: Holding[] }
      setHoldings(Array.isArray(data.accounts) ? data.accounts : [])
    } catch (e) {
      console.error('Failed to load accounts:', e)
      setHoldings([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-runs whenever the signed-in user changes — switching accounts on a shared
  // browser reloads the correct ledger instead of leaving the previous user's data.
  useEffect(() => {
    if (!isLoaded) return // wait for Clerk before deciding demo vs. server

    // Drop any pre-scoping global flag so it can never leak across users.
    if (typeof window !== 'undefined') localStorage.removeItem(LEGACY_DEMO_KEY)

    // Signed out: clear the ledger — don't show the last user's holdings.
    if (!userId) {
      setDemo(false)
      setHoldings([])
      setLoading(false)
      return
    }

    // This user's own demo flag reads the local seed; otherwise load from the server.
    if (typeof window !== 'undefined' && localStorage.getItem(demoKeyFor(userId)) === '1') {
      setDemo(true)
      setHoldings(SEED_HOLDINGS)
      setLoading(false)
      return
    }
    setDemo(false)
    void loadFromServer()
  }, [isLoaded, userId, loadFromServer])

  const addManual = useCallback(
    (account: Holding) => {
      const tempId = account.id ?? crypto.randomUUID()
      const optimistic: Holding = { ...account, id: tempId }
      setHoldings((prev) => [...prev, optimistic])
      if (demo) return
      // Persist, then swap the temp row for the server row (which has the real id).
      void (async () => {
        try {
          const res = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createBody(account)),
          })
          if (!res.ok) throw new Error(`POST /api/accounts ${res.status}`)
          const { account: saved } = (await res.json()) as { account: Holding }
          setHoldings((prev) => prev.map((h) => (h.id === tempId ? saved : h)))
        } catch (e) {
          console.error('Failed to add account:', e)
          setHoldings((prev) => prev.filter((h) => h.id !== tempId)) // roll back the add
        }
      })()
    },
    [demo],
  )

  const updateAccount = useCallback(
    (id: string, account: Holding) => {
      const prevItem = holdingsRef.current.find((h) => h.id === id)
      setHoldings((prev) => prev.map((h) => (h.id === id ? { ...account, id } : h)))
      if (demo) return
      void (async () => {
        try {
          const res = await fetch(`/api/accounts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateBody(account)),
          })
          if (!res.ok) throw new Error(`PATCH /api/accounts/${id} ${res.status}`)
          const { account: saved } = (await res.json()) as { account: Holding }
          setHoldings((prev) => prev.map((h) => (h.id === id ? saved : h)))
        } catch (e) {
          console.error('Failed to update account:', e)
          if (prevItem) setHoldings((prev) => prev.map((h) => (h.id === id ? prevItem : h)))
        }
      })()
    },
    [demo],
  )

  const removeAccount = useCallback(
    (id: string) => {
      const snapshot = holdingsRef.current
      // Mirror the server: drop the row and unlink any loan secured against it.
      setHoldings((prev) =>
        prev
          .filter((h) => h.id !== id)
          .map((h) => (h.securedAgainstId === id ? { ...h, securedAgainstId: undefined } : h)),
      )
      if (demo) return
      void (async () => {
        try {
          const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error(`DELETE /api/accounts/${id} ${res.status}`)
        } catch (e) {
          console.error('Failed to remove account:', e)
          setHoldings(snapshot) // restore the whole ledger — a delete is destructive
        }
      })()
    },
    [demo],
  )

  // Plaid link now creates the Account rows server-side (see exchange-public-token),
  // so these arrive already persisted with real ids — we merge them into the ledger
  // rather than POSTing again. Merging by id also dedupes a re-link (upsert returns
  // the same ids), updating balances in place.
  const addLinked = useCallback((accounts: Holding[]) => {
    if (accounts.length === 0) return
    setHoldings((prev) => {
      const byId = new Map(prev.map((h) => [h.id, h]))
      for (const a of accounts) if (a.id) byId.set(a.id, a)
      return Array.from(byId.values())
    })
  }, [])

  const clearLinked = useCallback(() => {
    const linked = holdingsRef.current.filter((h) => h.source !== 'manual')
    if (linked.length === 0) return
    const snapshot = holdingsRef.current
    setHoldings((prev) => prev.filter((h) => h.source === 'manual'))
    if (demo) return
    void (async () => {
      try {
        await Promise.all(
          linked.map((h) => h.id && fetch(`/api/accounts/${h.id}`, { method: 'DELETE' })),
        )
      } catch (e) {
        console.error('Failed to clear linked accounts:', e)
        setHoldings(snapshot)
      }
    })()
  }, [demo])

  const loadDemoData = useCallback(() => {
    if (typeof window !== 'undefined' && userId) localStorage.setItem(demoKeyFor(userId), '1')
    setDemo(true)
    setHoldings(SEED_HOLDINGS)
    setLoading(false)
  }, [userId])

  const exitDemo = useCallback(() => {
    if (typeof window !== 'undefined' && userId) localStorage.removeItem(demoKeyFor(userId))
    setDemo(false)
    void loadFromServer()
  }, [userId, loadFromServer])

  const value: AccountsContextValue = {
    holdings,
    loading,
    demo,
    hasLinked: holdings.some((h) => h.source !== 'manual'),
    addLinked,
    clearLinked,
    addManual,
    updateAccount,
    removeAccount,
    refresh: loadFromServer,
    loadDemoData,
    exitDemo,
  }

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
}

export function useAccounts() {
  const ctx = useContext(AccountsContext)
  if (!ctx) throw new Error('useAccounts must be used within AccountsProvider')
  return ctx
}
