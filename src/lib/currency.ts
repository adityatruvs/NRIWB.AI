import type { CurrencyMode } from '@/types/accounts'

export type { CurrencyMode }

const LAKH = 100_000
const CRORE = 10_000_000

export function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatLakhs(n: number): string {
  if (n >= CRORE) return `₹${(n / CRORE).toFixed(2)}Cr`
  if (n >= LAKH) return `₹${(n / LAKH).toFixed(2)}L`
  return formatINR(n)
}

export function toINR(usd: number, rate: number): number {
  return usd * rate
}

export function toUSD(inr: number, rate: number): number {
  return inr / rate
}

export function formatAmount(usd: number, mode: CurrencyMode, rate: number): string {
  if (mode === 'usd') return formatUSD(usd)
  const inr = toINR(usd, rate)
  if (mode === 'inr_lakhs') return formatLakhs(inr)
  return formatINR(inr)
}
