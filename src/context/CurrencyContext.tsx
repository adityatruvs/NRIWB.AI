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
const FALLBACK_RATE = 95

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<CurrencyMode>('usd')
  const [rate, setRate] = useState<number>(FALLBACK_RATE)

  useEffect(() => {
    const saved = localStorage.getItem('currency_mode') as CurrencyMode | null
    if (saved && MODES.includes(saved)) setMode(saved)
  }, [])

  useEffect(() => {
    fetch('/api/fx')
      .then((r) => r.json())
      .then((d) => { if (typeof d.rate === 'number') setRate(d.rate) })
      .catch(() => {})
  }, [])

  function selectMode(next: CurrencyMode) {
    setMode(next)
    localStorage.setItem('currency_mode', next)
  }

  return (
    <CurrencyContext.Provider value={{ mode, rate, setMode: selectMode }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
