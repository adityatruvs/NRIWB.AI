'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { MOCK_ACCOUNTS } from '@/data/mock/accounts'
import type { Holding } from '@/lib/portfolio'
import type { LinkedAccount } from '@/components/PlaidConnect'

interface AccountsContextValue {
  /** All holdings (mock seed + manual adds + Plaid-linked), normalized, each with a stable `id`. */
  holdings: Holding[]
  hasLinked: boolean
  addLinked: (accounts: LinkedAccount[]) => void
  clearLinked: () => void
  addManual: (account: Holding) => void
  /** Replace the holding with this id (keeps its id and position in the list). */
  updateAccount: (id: string, account: Holding) => void
  removeAccount: (id: string) => void
}

const AccountsContext = createContext<AccountsContextValue | null>(null)

// Deterministic ids for the seed set keep SSR and client renders in sync.
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

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  const [holdings, setHoldings] = useState<Holding[]>(SEED_HOLDINGS)
  const [linkedIds, setLinkedIds] = useState<ReadonlySet<string>>(new Set())

  // Persist holdings so edits survive reloads and stay consistent across every
  // page (dashboard, analyzer, etc.). We start from the deterministic seed for
  // SSR/hydration, then hydrate from localStorage after mount.
  const persistReady = useRef(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nriwb:holdings')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setHoldings(parsed)
      }
      const rawLinked = localStorage.getItem('nriwb:linked-ids')
      if (rawLinked) {
        const ids = JSON.parse(rawLinked)
        if (Array.isArray(ids)) setLinkedIds(new Set(ids))
      }
    } catch {
      /* ignore */
    }
  }, [])
  useEffect(() => {
    // Skip the first run (initial seed) so we never clobber stored edits on mount.
    if (!persistReady.current) {
      persistReady.current = true
      return
    }
    try {
      localStorage.setItem('nriwb:holdings', JSON.stringify(holdings))
      localStorage.setItem('nriwb:linked-ids', JSON.stringify([...linkedIds]))
    } catch {
      /* ignore */
    }
  }, [holdings, linkedIds])

  const value: AccountsContextValue = {
    holdings,
    hasLinked: linkedIds.size > 0,
    addLinked: (accounts) => {
      const withIds: Holding[] = accounts.map((a) => ({
        id: crypto.randomUUID(),
        nickname: a.nickname,
        institution: a.institution,
        accountType: a.accountType,
        country: a.country,
        balanceUsd: a.balanceUsd,
        balanceInr: a.balanceInr,
        isPfic: a.isPfic,
        source: a.source,
      }))
      setHoldings((prev) => [...prev, ...withIds])
      setLinkedIds((prev) => new Set([...prev, ...withIds.map((h) => h.id!)]))
    },
    clearLinked: () => {
      setHoldings((prev) => prev.filter((h) => !h.id || !linkedIds.has(h.id)))
      setLinkedIds(new Set())
    },
    addManual: (account) =>
      setHoldings((prev) => [...prev, { ...account, id: account.id ?? crypto.randomUUID() }]),
    updateAccount: (id, account) =>
      setHoldings((prev) => prev.map((h) => (h.id === id ? { ...account, id } : h))),
    removeAccount: (id) => {
      setHoldings((prev) => prev.filter((h) => h.id !== id))
      setLinkedIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
  }

  return (
    <AccountsContext.Provider value={value}>
      {children}
    </AccountsContext.Provider>
  )
}

export function useAccounts() {
  const ctx = useContext(AccountsContext)
  if (!ctx) throw new Error('useAccounts must be used within AccountsProvider')
  return ctx
}
