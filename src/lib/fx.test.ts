import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const upsert = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: { fxRate: { findUnique: (...args: unknown[]) => findUnique(...args), upsert: (...args: unknown[]) => upsert(...args) } },
}))

const { refreshFxRate, getFxSnapshot, FX_PAIR, FX_FALLBACK_RATE } = await import('./fx')

const NOW = new Date('2026-09-25T12:00:00.000Z')

function okProviderResponse(rate: number) {
  return { ok: true, status: 200, json: async () => ({ result: 'success', conversion_rate: rate }) }
}

describe('fx', () => {
  const originalKey = process.env.EXCHANGE_RATE_API_KEY
  const originalFetch = global.fetch

  beforeEach(() => {
    findUnique.mockReset()
    upsert.mockReset()
    process.env.EXCHANGE_RATE_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env.EXCHANGE_RATE_API_KEY = originalKey
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('refreshFxRate', () => {
    it('fetches the live rate, upserts it, and reports source "live"', async () => {
      global.fetch = vi.fn().mockResolvedValue(okProviderResponse(88.12)) as unknown as typeof fetch
      upsert.mockResolvedValue({ rate: 88.12, updatedAt: NOW })

      const snapshot = await refreshFxRate()

      expect(global.fetch).toHaveBeenCalledWith('https://v6.exchangerate-api.com/v6/test-key/pair/USD/INR')
      expect(upsert).toHaveBeenCalledWith({
        where: { pair: FX_PAIR },
        update: { rate: 88.12 },
        create: { pair: FX_PAIR, rate: 88.12 },
      })
      expect(snapshot).toEqual({ rate: 88.12, updatedAt: NOW.toISOString(), source: 'live' })
    })

    it('throws (and never writes) when no API key is configured', async () => {
      delete process.env.EXCHANGE_RATE_API_KEY
      global.fetch = vi.fn() as unknown as typeof fetch

      await expect(refreshFxRate()).rejects.toThrow('EXCHANGE_RATE_API_KEY is not set')
      expect(global.fetch).not.toHaveBeenCalled()
      expect(upsert).not.toHaveBeenCalled()
    })

    it('throws when the provider responds with a non-2xx status', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch

      await expect(refreshFxRate()).rejects.toThrow('exchangerate-api responded 403')
      expect(upsert).not.toHaveBeenCalled()
    })

    it('throws when the provider payload is malformed', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: 'error' }) }) as unknown as typeof fetch

      await expect(refreshFxRate()).rejects.toThrow(/exchangerate-api returned/)
      expect(upsert).not.toHaveBeenCalled()
    })
  })

  describe('getFxSnapshot', () => {
    it('serves the cached row without calling the provider', async () => {
      findUnique.mockResolvedValue({ rate: 83.9, updatedAt: NOW })
      global.fetch = vi.fn() as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: 83.9, updatedAt: NOW.toISOString(), source: 'cached' })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('bootstraps from the provider when the table has never been populated', async () => {
      findUnique.mockResolvedValue(null)
      upsert.mockResolvedValue({ rate: 90.1, updatedAt: NOW })
      global.fetch = vi.fn().mockResolvedValue(okProviderResponse(90.1)) as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: 90.1, updatedAt: NOW.toISOString(), source: 'live' })
    })

    it('falls back to the hardcoded rate when there is no row AND the provider fails', async () => {
      findUnique.mockResolvedValue(null)
      global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: FX_FALLBACK_RATE, updatedAt: null, source: 'fallback' })
      expect(upsert).not.toHaveBeenCalled()
    })

    it('falls back to the hardcoded rate when the database itself is unreachable and the provider also fails', async () => {
      findUnique.mockRejectedValue(new Error('connect ECONNREFUSED'))
      global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: FX_FALLBACK_RATE, updatedAt: null, source: 'fallback' })
    })

    it('recovers with a live rate when the cached read fails but the provider succeeds', async () => {
      findUnique.mockRejectedValue(new Error('connect ECONNREFUSED'))
      upsert.mockResolvedValue({ rate: 91.4, updatedAt: NOW })
      global.fetch = vi.fn().mockResolvedValue(okProviderResponse(91.4)) as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: 91.4, updatedAt: NOW.toISOString(), source: 'live' })
    })
  })
})
