'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { CurrencyMode } from '@/types/accounts'

interface CurrencyContextValue {
  mode: CurrencyMode
  rate: number
  updatedAt: string | null
  setMode: (mode: CurrencyMode) => void
}

const FALLBACK_RATE = 83.5

const CurrencyContext = createContext<CurrencyContextValue>({
  mode: 'usd',
  rate: FALLBACK_RATE,
  updatedAt: null,
  setMode: () => { },
})

const MODES: CurrencyMode[] = ['usd', 'inr', 'inr_lakhs']

export const REFRESH_INTERVAL_MS = 5 * 60_000

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<CurrencyMode>('usd')
  const [rate, setRate] = useState(FALLBACK_RATE)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

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

  useEffect(() => {
    void loadRate()
    const interval = setInterval(loadRate, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loadRate])

  function selectMode(next: CurrencyMode) {
    setMode(next)
    localStorage.setItem('currency_mode', next)
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
