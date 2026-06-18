'use client'

import { createContext, useContext, useState } from 'react'
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
