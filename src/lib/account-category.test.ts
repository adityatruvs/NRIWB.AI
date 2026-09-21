import { describe, it, expect } from 'vitest'
import { categoryOf, sortHoldings, CATEGORY_ORDER } from '@/lib/account-category'
import type { Holding } from '@/lib/portfolio'
import type { AccountType } from '@/types/accounts'

const NOW = new Date('2026-09-16T12:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

function h(over: Partial<Holding> & { accountType: AccountType }): Holding {
  return {
    nickname: over.nickname ?? over.accountType,
    institution: 'Bank',
    country: 'US',
    balanceUsd: 0,
    balanceInr: 0,
    isPfic: false,
    source: 'manual',
    ...over,
  }
}

describe('categoryOf', () => {
  it('maps asset types to their folders', () => {
    expect(categoryOf(h({ accountType: 'checking' }))).toBe('banking')
    expect(categoryOf(h({ accountType: 'fd' }))).toBe('banking')
    expect(categoryOf(h({ accountType: 'brokerage' }))).toBe('investments')
    expect(categoryOf(h({ accountType: 'mutual_fund' }))).toBe('investments')
    expect(categoryOf(h({ accountType: '401k' }))).toBe('retirement')
    expect(categoryOf(h({ accountType: 'roth_ira' }))).toBe('retirement')
    expect(categoryOf(h({ accountType: 'real_estate' }))).toBe('real_estate')
    expect(categoryOf(h({ accountType: 'property' }))).toBe('real_estate')
    expect(categoryOf(h({ accountType: 'vehicle' }))).toBe('other')
  })

  it('puts any debt under liabilities, whatever its type', () => {
    expect(categoryOf(h({ accountType: 'mortgage' }))).toBe('liabilities')
    expect(categoryOf(h({ accountType: 'credit_card' }))).toBe('liabilities')
    // Explicit liability kind on an ambiguous type still lands under liabilities.
    expect(categoryOf(h({ accountType: 'other', kind: 'liability' }))).toBe('liabilities')
  })

  it('every category in CATEGORY_ORDER is reachable', () => {
    const reached = new Set([
      categoryOf(h({ accountType: 'checking' })),
      categoryOf(h({ accountType: 'brokerage' })),
      categoryOf(h({ accountType: 'ira' })),
      categoryOf(h({ accountType: 'property' })),
      categoryOf(h({ accountType: 'mortgage' })),
      categoryOf(h({ accountType: 'vehicle' })),
    ])
    expect([...reached].sort()).toEqual([...CATEGORY_ORDER].sort())
  })
})

describe('sortHoldings', () => {
  const rate = 83
  const accounts = [
    h({ accountType: 'savings', nickname: 'Zebra', balanceUsd: 100, lastSyncedAt: daysAgo(200) }),
    h({ accountType: 'brokerage', nickname: 'Apple', balanceUsd: 5000, lastSyncedAt: daysAgo(5) }),
    h({ accountType: 'checking', nickname: 'Mango', balanceUsd: 1000, lastSyncedAt: daysAgo(50) }),
  ]

  it('balance: largest magnitude first', () => {
    expect(sortHoldings(accounts, 'balance', rate).map((a) => a.nickname)).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('name: alphabetical', () => {
    expect(sortHoldings(accounts, 'name', rate).map((a) => a.nickname)).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('freshness: stalest first', () => {
    expect(sortHoldings(accounts, 'freshness', rate).map((a) => a.nickname)).toEqual(['Zebra', 'Mango', 'Apple'])
  })

  it('does not mutate the input', () => {
    const input = [...accounts]
    sortHoldings(input, 'name', rate)
    expect(input.map((a) => a.nickname)).toEqual(['Zebra', 'Apple', 'Mango'])
  })
})
