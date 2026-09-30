import { describe, it, expect, vi, beforeEach } from 'vitest'

const items = vi.hoisted(() => [
  { id: '1', itemId: 'ok' },
  { id: '2', itemId: 'boom' },
  { id: '3', itemId: 'login' },
  { id: '4', itemId: 'ok2' },
])
vi.mock('@/lib/prisma', () => ({
  prisma: {
    fxRate: { findUnique: async () => null },
    plaidItem: { findMany: async () => items },
  },
}))
const seen = vi.hoisted(() => [] as string[])
vi.mock('@/lib/plaid-sync', () => ({
  syncPlaidItem: async (item: { itemId: string }) => {
    seen.push(item.itemId)
    if (item.itemId === 'boom') return { status: 'failed', accounts: [], error: 'x' }
    if (item.itemId === 'login') return { status: 'reauth', accounts: [] }
    return { status: 'synced', accounts: [{}, {}] }
  },
}))

const { GET } = await import('@/app/api/cron/plaid-sync/route')
const req = (auth?: string) => new Request('http://x/api/cron/plaid-sync', { headers: auth ? { authorization: auth } : {} })

beforeEach(() => {
  seen.length = 0
  process.env.CRON_SECRET = 's3cret'
})

describe('GET /api/cron/plaid-sync', () => {
  it('rejects a missing or wrong secret with 401', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer nope'))).status).toBe(401)
    expect(seen).toEqual([])
  })

  it('rejects everything when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req('Bearer '))).status).toBe(401)
  })

  it('syncs every item; one failure does not stop the rest; reports counts', async () => {
    const res = await GET(req('Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(seen).toEqual(['ok', 'boom', 'login', 'ok2'])
    expect(await res.json()).toEqual({ items: 4, synced: 2, failed: 1, reauth: 1, accounts: 4 })
  })
})
