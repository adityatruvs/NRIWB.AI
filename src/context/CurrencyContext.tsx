'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { CurrencyMode } from '@/types/accounts'

interface CurrencyContextValue {
  mode: CurrencyMode
  rate: number
  updatedAt: string | null
  setMode: (mode: CurrencyMode) => void
}

// There is no hardcoded rate. Outside a provider `rate` is NaN, so a missing
// provider shows up as NaN, not as a plausible but wrong number.
const CurrencyContext = createContext<CurrencyContextValue>({
  mode: 'usd',
  rate: Number.NaN,
  updatedAt: null,
  setMode: () => { },
})

const MODES: CurrencyMode[] = ['usd', 'inr', 'inr_lakhs']

export const REFRESH_INTERVAL_MS = 5 * 60_000
export const RETRY_INTERVAL_MS = 5_000

export function CurrencyProvider({
  children,
  initialRate,
  initialUpdatedAt = null,
}: {
  children: React.ReactNode
  /** The live rate, read on the server for this request, so the first render already uses it. */
  initialRate?: number
  // Without one, nothing renders until /api/fx returns a live (or last saved) rate.
  initialUpdatedAt?: string | null
}) {
  const [mode, setMode] = useState<CurrencyMode>('usd')
  const [rate, setRate] = useState<number | null>(initialRate ?? null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt)

  useEffect(() => {
    const saved = localStorage.getItem('currency_mode') as CurrencyMode | null
    if (saved && MODES.includes(saved)) setMode(saved)
  }, [])

  const loadRate = useCallback(async () => {
    try {
      const res = await fetch('/api/fx')
      if (!res.ok) throw new Error(`GET /api/fx ${res.status}`)
      const data = (await res.json()) as { rate: number; updatedAt: string | null }
      setRate(data.rate)
      setUpdatedAt(data.updatedAt)
    } catch (e) {

      console.error('Failed to load FX rate:', e)
    }
  }, [])

  // Poll every few minutes; while there's no rate at all, retry every few seconds.
  const waiting = rate === null
  useEffect(() => {
    void loadRate()
  }, [loadRate])
  useEffect(() => {
    const interval = setInterval(loadRate, waiting ? RETRY_INTERVAL_MS : REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loadRate, waiting])

  function selectMode(next: CurrencyMode) {
    setMode(next)
    localStorage.setItem('currency_mode', next)
  }

  if (rate === null) {
    return (
      <div role="status" className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
        Getting the live USD / INR rate…
      </div>
    )
  }
  return (
    <CurrencyContext.Provider value={{ mode, rate, updatedAt, setMode: selectMode }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
