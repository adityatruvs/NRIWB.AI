/**
 * Goal amounts written in rupees. The AI never converts currency: it reports the
 * amount in the currency the user wrote, and the app converts at its own live
 * rate. An explicit rupee amount in the text ("₹1.2 crore", "50 lakh",
 * "₹12,00,000") is read here directly, so a model slip in lakh/crore arithmetic
 * can't change it. Pure + testable.
 */

import { formatLakhs, formatUSD } from '@/lib/currency'

const LAKH = 100_000
const CRORE = 10_000_000

/**
 * The rupee amount stated in `text`, or null when it names none (or more than one,
 * which is ambiguous). Needs a rupee marker (₹, Rs, INR) or a lakh/crore unit.
 */
export function statedInrAmount(text: string): number | null {
  const found: number[] = []
  // "₹1.2 crore", "Rs. 50 lakh", "INR 3.5cr", "1.2 crore", "50 lakhs", "₹50L"
  const unitRe = /(?:₹|\brs\.?|\binr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l)\b/gi
  for (const m of text.matchAll(unitRe)) {
    const n = Number(m[1].replace(/,/g, ''))
    const unit = m[2].toLowerCase()
    // A bare "l" only counts with a rupee marker ("₹50L"), not e.g. "5 l" of something.
    if (unit === 'l' && !/₹|rs|inr/i.test(m[0])) continue
    found.push(n * (unit.startsWith('c') ? CRORE : LAKH))
  }
  // "₹12,00,000", "Rs 500000", "INR 1,20,00,000" — a plain number after a rupee marker.
  const plainRe = /(?:₹|\brs\.?|\binr)\s*(\d+(?:,\d+)*(?:\.\d+)?)(?!\s*(?:crores?|cr|lakhs?|lacs?|l)\b)(?!\d|[.,]\d)/gi
  for (const m of text.matchAll(plainRe)) found.push(Number(m[1].replace(/,/g, '')))

  const amounts = [...new Set(found.filter((n) => Number.isFinite(n) && n > 0))]
  return amounts.length === 1 ? amounts[0] : null
}

/** True when the text states a dollar amount ("$2M", "$150k", "USD 500000", "50k dollars"). */
export function statesUsdAmount(text: string): boolean {
  return /\$\s*\d|\busd\s*\d|\d[\d,.]*\s*(?:k|m|mn|million)?\s*(?:usd|dollars?)\b/i.test(text)
}

export interface GoalTarget {
  targetUsd: number
  /** Shown under the description, e.g. "₹1.20Cr at ₹95.00/USD ≈ $126,316". Null for a dollar amount. */
  conversion: string | null
}

/**
 * The USD target from the model's amount + currency, with an explicit rupee
 * amount in the description taking precedence over the model's reading of it.
 */
export function goalTarget(
  description: string,
  model: { amount: number; currency: 'USD' | 'INR' },
  rate: number,
): GoalTarget {
  // A rupee amount in the text replaces the model's figure only when the target is
  // in rupees: the model said INR, or it said USD but the text has no dollar amount
  // (it converted the rupees itself). "$2M target; ₹50L in EPF" stays $2M.
  const stated = statedInrAmount(description)
  const useStated = stated != null && (model.currency === 'INR' || !statesUsdAmount(description))
  const inr = useStated ? stated : model.currency === 'INR' ? model.amount : null
  if (inr == null) return { targetUsd: Math.max(0, Math.round(model.amount)), conversion: null }
  const targetUsd = Math.round(inr / rate)
  return { targetUsd, conversion: `${formatLakhs(inr)} at ₹${rate.toFixed(2)}/USD ≈ ${formatUSD(targetUsd)}` }
}
