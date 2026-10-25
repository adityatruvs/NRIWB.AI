import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnauthorizedError } from '@/lib/auth'

const { mockRequireUserId } = vi.hoisted(() => ({ mockRequireUserId: vi.fn() }))
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return { ...actual, requireUserId: mockRequireUserId }
})

const db = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { account: { findUnique: db.findUnique, create: db.create, findFirst: vi.fn() } } }))

const { mockSnapshot } = vi.hoisted(() => ({ mockSnapshot: vi.fn() }))
vi.mock('@/lib/snapshots', () => ({ writeDailySnapshot: mockSnapshot }))

const { Prisma } = await import('@/generated/prisma')
const { POST } = await import('./route')

const KEY = '3f2b8c1e-9d4a-4e7b-8a61-0c5d2e9f7a10'
const body = (over: Record<string, unknown> = {}) => ({
  nickname: 'Chase Checking',
  institution: 'Chase',
  accountType: 'checking',
  country: 'US',
  balanceUsd: 5000,
  balanceInr: 500000,
  ...over,
})
const req = (b: unknown) =>
  new Request('http://x/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })

const row = (over: Record<string, unknown> = {}) => ({
  id: KEY,
  userId: 'me',
  nickname: 'Chase Checking',
  institution: 'Chase',
  accountType: 'checking',
  country: 'US',
  balanceUsd: 5000,
  balanceInr: 500000,
  isPfic: false,
  source: 'manual',
  kind: 'asset',
  securedAgainstId: null,
  ownership: 'self',
  coOwners: null,
  details: null,
  lastSyncedAt: new Date(),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireUserId.mockResolvedValue('me')
})

describe('POST /api/accounts — a repeated save creates the account once', () => {
  it('without a key it creates every time, as before', async () => {
    db.create.mockResolvedValue(row({ id: 'cuid1' }))
    const res = await POST(req(body()))
    expect(res.status).toBe(201)
    expect(db.findUnique).not.toHaveBeenCalled()
    expect(db.create.mock.calls[0][0].data).not.toHaveProperty('id')
  })

  it('with a new key it creates the account under that key', async () => {
    db.findUnique.mockResolvedValue(null)
    db.create.mockResolvedValue(row())
    const res = await POST(req(body({ clientId: KEY })))
    expect(res.status).toBe(201)
    expect(db.create.mock.calls[0][0].data).toMatchObject({ id: KEY, userId: 'me' })
    expect(mockSnapshot).toHaveBeenCalledTimes(1)
  })

  it('the same key again returns the existing account: 200, nothing created, no second snapshot', async () => {
    db.findUnique.mockResolvedValue(row())
    const res = await POST(req(body({ clientId: KEY })))
    expect(res.status).toBe(200)
    expect((await res.json()).account.id).toBe(KEY)
    expect(db.create).not.toHaveBeenCalled()
    expect(mockSnapshot).not.toHaveBeenCalled()
  })

  it('a key that belongs to someone else is refused, and their account is not revealed', async () => {
    db.findUnique.mockResolvedValue(row({ userId: 'someone-else' }))
    const res = await POST(req(body({ clientId: KEY })))
    expect(res.status).toBe(409)
    expect(JSON.stringify(await res.json())).not.toContain('Chase')
    expect(db.create).not.toHaveBeenCalled()
  })

  it('two copies arriving together: the loser gets the winner’s row, not an error', async () => {
    db.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row())
    db.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
    const res = await POST(req(body({ clientId: KEY })))
    expect(res.status).toBe(200)
    expect((await res.json()).account.id).toBe(KEY)
  })

  it.each(['short', 'has spaces in it!!', 'x'.repeat(65), '../../etc/passwd/aaaaaa'])('rejects a malformed key %j', async (clientId) => {
    const res = await POST(req(body({ clientId })))
    expect(res.status).toBe(400)
    expect(db.create).not.toHaveBeenCalled()
  })

  it('still needs a signed-in user', async () => {
    mockRequireUserId.mockRejectedValue(new UnauthorizedError())
    const res = await POST(req(body({ clientId: KEY })))
    expect(res.status).toBe(401)
    expect(db.findUnique).not.toHaveBeenCalled()
  })
})
