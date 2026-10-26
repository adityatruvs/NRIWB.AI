import { describe, it, expect } from 'vitest'
import { balanceText, isQuickEditable, reviewBalances, undoableChanges } from '@/lib/quick-balances'
import type { Holding } from '@/lib/portfolio'

const RATE = 80
const h = (id: string, over: Partial<Holding> = {}): Holding => ({
  id,
  nickname: id,
  institution: 'Bank',
  accountType: 'nre',
  country: 'IN',
  balanceUsd: 5_000_000 / RATE,
  balanceInr: 5_000_000,
  isPfic: false,
  source: 'manual',
  ...over,
})
const LIST = [h('a'), h('b', { accountType: 'checking', country: 'US', balanceUsd: 1000, balanceInr: 80000 }), h('c', { source: 'plaid' })]

describe('quick edit review', () => {
  it('only manual accounts are editable', () => {
    expect(LIST.map(isQuickEditable)).toEqual([true, true, false])
  })
  it('shows balances in their own currency', () => {
    expect(balanceText(LIST[0], RATE)).toBe('50,00,000')
    expect(balanceText(LIST[1], RATE)).toBe('1,000')
  })
  it('a typed change is a change; the same number is not', () => {
    const r = reviewBalances(LIST, new Map([['a', '60L'], ['b', '1,000']]), RATE)
    expect(r.changes).toHaveLength(1)
    expect(r.changes[0].after.balanceInr).toBe(6_000_000)
    expect(r.changes[0].after.balanceUsd).toBeCloseTo(75_000)
    expect(r.invalid.size).toBe(0)
  })
  it('US balances re-derive INR at the live rate', () => {
    const r = reviewBalances(LIST, new Map([['b', '2k']]), RATE)
    expect(r.changes[0].after).toMatchObject({ balanceUsd: 2000, balanceInr: 160000 })
  })
  it('blank, nonsense and negatives are invalid and not changes; zero is allowed (a paid-off loan)', () => {
    const r = reviewBalances(LIST, new Map([['a', ''], ['b', 'abc']]), RATE)
    expect([...r.invalid].sort()).toEqual(['a', 'b'])
    expect(r.changes).toEqual([])
    expect(reviewBalances(LIST, new Map([['a', '-5']]), RATE).invalid.has('a')).toBe(true)
    expect(reviewBalances(LIST, new Map([['a', '0']]), RATE).changes).toHaveLength(1)
  })
  it('a bank-linked balance can never change, even if a draft exists for it', () => {
    const r = reviewBalances(LIST, new Map([['c', '1']]), RATE)
    expect(r.changes).toEqual([])
    expect(r.invalid.size).toBe(0)
  })
  it('drafts for accounts that are gone are ignored', () => {
    expect(reviewBalances(LIST, new Map([['zzz', '1']]), RATE).changes).toEqual([])
  })
})

describe('undo', () => {
  it('restores only accounts still holding the saved balance', () => {
    const { changes } = reviewBalances(LIST, new Map([['a', '60L'], ['b', '2k']]), RATE)
    const now = LIST.map((x) => changes.find((c) => c.after.id === x.id)?.after ?? x)
    // 'b' is changed again after saving (say a manual edit): leave it.
    now[1] = { ...now[1], balanceUsd: 3000, balanceInr: 240000 }
    expect(undoableChanges(changes, now).map((c) => c.after.id)).toEqual(['a'])
  })
  it('skips an account removed since', () => {
    const { changes } = reviewBalances(LIST, new Map([['a', '60L']]), RATE)
    expect(undoableChanges(changes, [])).toEqual([])
  })
})
