'use client'

import { useEffect, useState } from 'react'
import { useAccounts } from '@/context/AccountsContext'
import { useCurrency } from '@/context/CurrencyContext'
import type { RecordedFbarPeak } from '@/lib/fbar'

/**
 * This year's recorded FBAR peak (null: no history, so current balances are the
 * basis). Shared by the header and the dashboard so both judge FBAR on the same
 * figure. Re-fetched when a balance changes; demo has no history.
 */
export function useFbarRecorded(): RecordedFbarPeak | null {
  const { holdings, demo, loading } = useAccounts()
  const { rate } = useCurrency()
  const [recorded, setRecorded] = useState<RecordedFbarPeak | null>(null)
  const balanceKey = holdings.map((h) => `${h.id}:${h.balanceUsd}:${h.balanceInr}`).join('|')
  useEffect(() => {
    if (demo || loading) {
      setRecorded(null)
      return
    }
    let live = true
    fetch(`/api/fbar?rate=${rate}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { recorded: RecordedFbarPeak | null } | null) => live && setRecorded(d?.recorded ?? null))
      .catch(() => live && setRecorded(null))
    return () => {
      live = false
    }
  }, [demo, loading, rate, balanceKey])
  return recorded
}
