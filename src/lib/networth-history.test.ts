import { describe, it, expect } from 'vitest'
import { buildHistory, rangeDates, monthAgoValue, type HistoryAccount, type SnapshotRow } from '@/lib/networth-history'

const TODAY = '2026-09-30'
const RATE = 80

const accounts: HistoryAccount[] = [
  { id: 'us1', country: 'US', liability: false },
  { id: 'in1', country: 'IN', liability: false },
  { id: 'loan', country: 'IN', liability: true },
]
const snap = (accountId: string, day: string, usd: number, inr = 0): SnapshotRow => ({
  accountId,
  day,
  balanceUsd: usd,
  balanceInr: inr,
})
const at = (h: ReturnType<typeof buildHistory>, date: string) => h.points.find((p) => p.date === date)

describe('rangeDates', () => {
  it('is 90 daily points ending today', () => {
    const d = rangeDates('90d', TODAY)
    expect(d).toHaveLength(90)
    expect(d[89]).toBe(TODAY)
    expect(d[0]).toBe('2026-07-03')
  })
  it('is 11 month-ends then today for 12m', () => {
    const d = rangeDates('12m', TODAY)
    expect(d).toHaveLength(12)
    expect(d[0]).toBe('2025-10-31')
    expect(d[10]).toBe('2026-08-31')
    expect(d[11]).toBe(TODAY)
  })
})

describe('buildHistory', () => {
  it('returns an empty history when there are no snapshots', () => {
    const h = buildHistory({ accounts, snapshots: [], rate: RATE, range: '90d', today: TODAY })
    expect(h).toEqual({ points: [], firstDay: null, days: 0 })
  })

  it('carries each account forward from its last snapshot', () => {
    const h = buildHistory({
      accounts,
      snapshots: [snap('us1', '2026-09-01', 1000), snap('us1', '2026-09-10', 1500)],
      rate: RATE,
      range: '90d',
      today: TODAY,
    })
    expect(h.firstDay).toBe('2026-09-01')
    expect(h.points[0].date).toBe('2026-09-01') // starts when history does
    expect(at(h, '2026-09-05')!.all).toBe(1000)
    expect(at(h, '2026-09-10')!.all).toBe(1500)
    expect(at(h, TODAY)!.all).toBe(1500)
    expect(h.days).toBe(2)
  })

  it('adds a new account only from the day it was added', () => {
    const h = buildHistory({
      accounts,
      snapshots: [snap('us1', '2026-09-01', 1000), snap('in1', '2026-09-20', 0, 80_000)],
      rate: RATE,
      range: '90d',
      today: TODAY,
    })
    expect(at(h, '2026-09-19')!.all).toBe(1000)
    expect(at(h, '2026-09-20')!.all).toBe(2000)
    expect(at(h, '2026-09-20')!.in).toBe(1000)
    expect(at(h, '2026-09-20')!.us).toBe(1000)
  })

  it('counts liabilities negative and converts INR at the current rate', () => {
    const h = buildHistory({
      accounts,
      snapshots: [snap('in1', '2026-09-01', 999, 160_000), snap('loan', '2026-09-01', 999, 80_000)],
      rate: RATE,
      range: '90d',
      today: TODAY,
    })
    expect(at(h, TODAY)!.in).toBe(2000 - 1000)
  })

  it('ignores snapshots of deleted accounts', () => {
    const h = buildHistory({
      accounts,
      snapshots: [snap('gone', '2026-08-01', 1_000_000), snap('us1', '2026-09-01', 10)],
      rate: RATE,
      range: '90d',
      today: TODAY,
    })
    expect(h.firstDay).toBe('2026-09-01')
    expect(at(h, TODAY)!.all).toBe(10)
  })

  it('plots month-ends for 12m', () => {
    const h = buildHistory({
      accounts,
      snapshots: [snap('us1', '2026-07-15', 100), snap('us1', '2026-08-20', 200)],
      rate: RATE,
      range: '12m',
      today: TODAY,
    })
    expect(h.points.map((p) => [p.date, p.all])).toEqual([
      ['2026-07-31', 100],
      ['2026-08-31', 200],
      [TODAY, 200],
    ])
  })
})

describe('monthAgoValue', () => {
  it('is hidden until a snapshot is at least 28 days old', () => {
    const h = buildHistory({ accounts, snapshots: [snap('us1', '2026-09-10', 5)], rate: RATE, range: '90d', today: TODAY })
    expect(monthAgoValue(h, 'all', TODAY)).toBeNull()
  })
  it('returns the value ~30 days ago once there is a month of history', () => {
    const h = buildHistory({
      accounts,
      snapshots: [snap('us1', '2026-08-01', 100), snap('us1', '2026-09-15', 300)],
      rate: RATE,
      range: '90d',
      today: TODAY,
    })
    expect(monthAgoValue(h, 'all', TODAY)).toBe(100)
  })
})
