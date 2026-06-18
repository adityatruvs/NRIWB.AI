'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import type { CurrencyMode } from '@/types/accounts'

interface CurrencyContextValue {
  mode: CurrencyMode
  rate: number
  setMode: (mode: CurrencyMode) => void
}

const CurrencyContext = createContext<CurrencyContextValue>({
  mode: 'usd',
  rate: 95,
  setMode: () => {},
})

const MODES: CurrencyMode[] = ['usd', 'inr', 'inr_lakhs']

// Hardcoded for Phase 1. Replaced by ExchangeRate-API in Sprint 1 (S1-1).
const FX_RATE = 95

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<CurrencyMode>('usd')

  useEffect(() => {
    const saved = localStorage.getItem('currency_mode') as CurrencyMode | null
    if (saved && MODES.includes(saved)) setMode(saved)
  }, [])

  function selectMode(next: CurrencyMode) {
    setMode(next)
    localStorage.setItem('currency_mode', next)
  }

  return (
    <CurrencyContext.Provider value={{ mode, rate: FX_RATE, setMode: selectMode }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
