/**
 * Provenance + confidence for a holding's numbers — where a figure came from
 * (Plaid / CAS / manual / estimate) and how much to trust it. Pure + testable;
 * the row UI renders the badge from this.
 */

import type { Holding } from '@/lib/portfolio'
import type { AccountType } from '@/types/accounts'

export type ProvenanceSource = 'plaid' | 'setu' | 'cas' | 'manual' | 'estimate'
export type Confidence = 'high' | 'medium' | 'low'

export interface Provenance {
  source: ProvenanceSource
  label: string
  confidence: Confidence
}

/**
 * Manual asset types whose value is inherently an estimate (illiquid — you guess a
 * market value rather than read a balance). These read as low-confidence.
 */
const ESTIMATE_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  'real_estate',
  'property',
  'gold',
  'vehicle',
])

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'Synced from source',
  medium: 'You entered this',
  low: 'Estimated value — worth verifying',
}

/**
 * Classify a holding's provenance + confidence:
 * - plaid / setu / CAS (statement) → high (came from an institution or document)
 * - manual with a known balance → medium (you typed it)
 * - manual value of an illiquid asset (home, gold, …) → low, flagged as an estimate
 */
export function provenanceOf(h: Holding): Provenance {
  switch (h.source) {
    case 'plaid':
      return { source: 'plaid', label: 'Plaid', confidence: 'high' }
    case 'setu':
      return { source: 'setu', label: 'Setu', confidence: 'high' }
    case 'pdf_upload':
      return { source: 'cas', label: 'CAS', confidence: 'high' }
    case 'manual':
    default:
      if (ESTIMATE_TYPES.has(h.accountType)) {
        return { source: 'estimate', label: 'Estimate', confidence: 'low' }
      }
      return { source: 'manual', label: 'Manual', confidence: 'medium' }
  }
}
