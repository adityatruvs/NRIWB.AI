import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshFxRate = vi.fn()
const getFxSnapshot = vi.fn()

vi.mock('@/lib/fx', () => ({
  refreshFxRate: (...args: unknown[]) => refreshFxRate(...args),
  getFxSnapshot: (...args: unknown[]) => getFxSnapshot(...args),
  FX_PAIR: 'USD_INR',
}))

const { GET } = await import('./route')

function req(headers?: Record<string, string>) {
  return new Request('http://localhost/api/fx/update', { headers })
}

describe('GET /api/fx/update', () => {
  const originalSecret = process.env.CRON_SECRET

  beforeEach(() => {
    refreshFxRate.mockReset()
    getFxSnapshot.mockReset()
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret
  })

  it('refuses to run when CRON_SECRET is not configured on the server', async () => {
    delete process.env.CRON_SECRET

    const res = await GET(req())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Not configured' })
    expect(refreshFxRate).not.toHaveBeenCalled()
  })

  it('rejects a request with no Authorization header', async () => {
    process.env.CRON_SECRET = 'secret123'

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(refreshFxRate).not.toHaveBeenCalled()
  })

  it('rejects a request with the wrong secret', async () => {
    process.env.CRON_SECRET = 'secret123'

    const res = await GET(req({ authorization: 'Bearer wrong' }))

    expect(res.status).toBe(401)
    expect(refreshFxRate).not.toHaveBeenCalled()
  })

  it('refreshes and returns the live snapshot when the secret matches', async () => {
    process.env.CRON_SECRET = 'secret123'
    refreshFxRate.mockResolvedValue({ rate: 88.1, updatedAt: '2026-09-25T10:00:00.000Z', source: 'live' })

    const res = await GET(req({ authorization: 'Bearer secret123' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rate: 88.1, updatedAt: '2026-09-25T10:00:00.000Z', source: 'live' })
    expect(getFxSnapshot).not.toHaveBeenCalled()
  })

  it('falls back to the last-known snapshot (still 200) when the provider refresh fails', async () => {
    process.env.CRON_SECRET = 'secret123'
    refreshFxRate.mockRejectedValue(new Error('provider down'))
    getFxSnapshot.mockResolvedValue({ rate: 83.5, updatedAt: null, source: 'fallback' })

    const res = await GET(req({ authorization: 'Bearer secret123' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rate: 83.5, updatedAt: null, source: 'fallback' })
  })
})
