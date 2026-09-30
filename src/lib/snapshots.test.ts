import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory stand-in for the BalanceSnapshot table, keyed like the real unique index.
const table = vi.hoisted(() => new Map<string, { balanceUsd: number; balanceInr: number; recordedAt: Date }>())
vi.mock('@/lib/prisma', () => ({
  prisma: {
    balanceSnapshot: {
      upsert: async ({ where, update, create }: {
        where: { accountId_day: { accountId: string; day: Date } }
        update: { balanceUsd: number; balanceInr: number; recordedAt: Date }
        create: { balanceUsd: number; balanceInr: number; recordedAt: Date }
      }) => {
        const k = `${where.accountId_day.accountId}|${where.accountId_day.day.toISOString()}`
        table.set(k, table.has(k) ? { ...table.get(k)!, ...update } : create)
      },
    },
  },
}))

const { snapshotDay, balanceChanged, writeDailySnapshot } = await import('@/lib/snapshots')

beforeEach(() => table.clear())

describe('snapshotDay', () => {
  it('is the UTC date, regardless of time of day', () => {
    expect(snapshotDay(new Date('2026-03-05T00:00:01Z')).toISOString()).toBe('2026-03-05T00:00:00.000Z')
    expect(snapshotDay(new Date('2026-03-05T23:59:59Z')).toISOString()).toBe('2026-03-05T00:00:00.000Z')
  })
})

describe('balanceChanged', () => {
  const before = { balanceUsd: 100, balanceInr: 8300 }
  it('is false for non-balance edits', () => {
    expect(balanceChanged(before, { nickname: 'x' } as never)).toBe(false)
    expect(balanceChanged(before, { balanceUsd: 100, balanceInr: 8300 })).toBe(false)
  })
  it('is true when either balance moves', () => {
    expect(balanceChanged(before, { balanceUsd: 101 })).toBe(true)
    expect(balanceChanged(before, { balanceInr: 9000 })).toBe(true)
  })
})

describe('writeDailySnapshot', () => {
  it('keeps one row per account per UTC day, holding the latest value', async () => {
    await writeDailySnapshot('a1', 100, 8300, new Date('2026-03-05T08:00:00Z'))
    await writeDailySnapshot('a1', 250, 20750, new Date('2026-03-05T20:00:00Z'))
    expect(table.size).toBe(1)
    expect([...table.values()][0].balanceUsd).toBe(250)
  })

  it('starts a new row on the next UTC day and keeps accounts separate', async () => {
    await writeDailySnapshot('a1', 100, 0, new Date('2026-03-05T23:30:00Z'))
    await writeDailySnapshot('a1', 110, 0, new Date('2026-03-06T00:30:00Z'))
    await writeDailySnapshot('a2', 5, 0, new Date('2026-03-06T00:30:00Z'))
    expect(table.size).toBe(3)
  })
})
