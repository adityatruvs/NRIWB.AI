import { describe, it, expect } from 'vitest'
import { provenanceOf } from '@/lib/provenance'
import type { Holding } from '@/lib/portfolio'
import type { AccountType, AccountSource } from '@/types/accounts'

function h(source: AccountSource, accountType: AccountType): Holding {
  return {
    nickname: 'x',
    institution: 'Bank',
    accountType,
    country: 'US',
    balanceUsd: 1,
    balanceInr: 0,
    isPfic: false,
    source,
  }
}

describe('provenanceOf', () => {
  it('maps linked/imported sources to high confidence', () => {
    expect(provenanceOf(h('plaid', 'checking'))).toMatchObject({ source: 'plaid', label: 'Plaid', confidence: 'high' })
    expect(provenanceOf(h('setu', 'savings'))).toMatchObject({ source: 'setu', confidence: 'high' })
    expect(provenanceOf(h('pdf_upload', 'mutual_fund'))).toMatchObject({ source: 'cas', label: 'CAS', confidence: 'high' })
  })

  it('treats a manual known balance as medium confidence', () => {
    expect(provenanceOf(h('manual', 'checking'))).toMatchObject({ source: 'manual', label: 'Manual', confidence: 'medium' })
    expect(provenanceOf(h('manual', 'brokerage')).confidence).toBe('medium')
  })

  it('flags manual illiquid-asset values as low-confidence estimates', () => {
    for (const t of ['real_estate', 'property', 'gold', 'vehicle'] as AccountType[]) {
      const p = provenanceOf(h('manual', t))
      expect(p.source).toBe('estimate')
      expect(p.confidence).toBe('low')
    }
  })

  it('a Plaid-linked property is still high confidence (came from the source)', () => {
    expect(provenanceOf(h('plaid', 'real_estate')).confidence).toBe('high')
  })
})
