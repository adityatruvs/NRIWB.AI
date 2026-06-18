'use client'

import NumberFlow from '@number-flow/react'
import { useCurrency } from '@/context/CurrencyContext'

const LAKH = 100_000
const CRORE = 10_000_000

/**
 * Smoothly-animated, currency-aware money figure.
 * Mirrors `formatAmount` (USD / INR / lakhs-crore) but transitions digit-by-digit
 * via NumberFlow whenever the value, rate, or display mode changes.
 */
export function Money({ usd, className }: { usd: number; className?: string }) {
  const { mode, rate } = useCurrency()

  if (mode === 'usd') {
    return (
      <NumberFlow
        value={Math.round(usd)}
        format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
        locales="en-US"
        className={className}
      />
    )
  }

  const inr = usd * rate

  if (mode === 'inr_lakhs') {
    if (inr >= CRORE) {
      return (
        <NumberFlow
          value={inr / CRORE}
          format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
          prefix="₹"
          suffix="Cr"
          className={className}
        />
      )
    }
    if (inr >= LAKH) {
      return (
        <NumberFlow
          value={inr / LAKH}
          format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
          prefix="₹"
          suffix="L"
          className={className}
        />
      )
    }
  }

  return (
    <NumberFlow
      value={Math.round(inr)}
      format={{ style: 'currency', currency: 'INR', maximumFractionDigits: 0 }}
      locales="en-IN"
      className={className}
    />
  )
}
