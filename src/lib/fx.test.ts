import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findUnique = vi.fn()
const upsert = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: { fxRate: { findUnique: (...args: unknown[]) => findUnique(...args), upsert: (...args: unknown[]) => upsert(...args) } },
}))

const { refreshFxRate, getFxSnapshot, FX_PAIR, FX_STALE_AFTER_MS, FxUnavailableError } = await import('./fx')

const NOW = new Date('2026-09-25T12:00:00.000Z')

function okProviderResponse(rate: number) {
  return { ok: true, status: 200, json: async () => ({ result: 'success', conversion_rate: rate }) }
}

describe('fx', () => {
  const originalKey = process.env.EXCHANGE_RATE_API_KEY
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    findUnique.mockReset()
    upsert.mockReset()
    process.env.EXCHANGE_RATE_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env.EXCHANGE_RATE_API_KEY = originalKey
    global.fetch = originalFetch
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('refreshFxRate', () => {
    it('fetches the live rate, upserts it, and reports source "live"', async () => {
      global.fetch = vi.fn().mockResolvedValue(okProviderResponse(88.12)) as unknown as typeof fetch
      upsert.mockResolvedValue({ rate: 88.12, updatedAt: NOW })

      const snapshot = await refreshFxRate()

      expect(global.fetch).toHaveBeenCalledWith('https://v6.exchangerate-api.com/v6/test-key/pair/USD/INR', {
        signal: expect.any(AbortSignal), // bounded, so a hung provider falls back to the saved rate
      })
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
    it('serves a fresh cached row without calling the provider', async () => {
      findUnique.mockResolvedValue({ rate: 83.9, updatedAt: NOW })
      global.fetch = vi.fn() as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: 83.9, updatedAt: NOW.toISOString(), source: 'cached' })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('reuses a rate saved earlier today (20h ago) without calling the provider — refresh is daily', async () => {
      const earlier = new Date(NOW.getTime() - 20 * 60 * 60 * 1000)
      findUnique.mockResolvedValue({ rate: 95.3, updatedAt: earlier })
      global.fetch = vi.fn() as unknown as typeof fetch

      expect(await getFxSnapshot()).toEqual({ rate: 95.3, updatedAt: earlier.toISOString(), source: 'cached' })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('refreshes from the provider when the cached row is stale', async () => {
      const stale = new Date(NOW.getTime() - FX_STALE_AFTER_MS - 1000)
      findUnique.mockResolvedValue({ rate: 83.9, updatedAt: stale })
      upsert.mockResolvedValue({ rate: 96.4, updatedAt: NOW })
      global.fetch = vi.fn().mockResolvedValue(okProviderResponse(96.4)) as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: 96.4, updatedAt: NOW.toISOString(), source: 'live' })
    })

    it('serves the stale cached rate when the refresh fails', async () => {
      const stale = new Date(NOW.getTime() - FX_STALE_AFTER_MS - 1000)
      findUnique.mockResolvedValue({ rate: 83.9, updatedAt: stale })
      global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: 83.9, updatedAt: stale.toISOString(), source: 'cached' })
      expect(upsert).not.toHaveBeenCalled()
    })

    it('bootstraps from the provider when the table has never been populated', async () => {
      findUnique.mockResolvedValue(null)
      upsert.mockResolvedValue({ rate: 90.1, updatedAt: NOW })
      global.fetch = vi.fn().mockResolvedValue(okProviderResponse(90.1)) as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: 90.1, updatedAt: NOW.toISOString(), source: 'live' })
    })

    it('never invents a rate: no saved row AND the provider fails → FxUnavailableError', async () => {
      findUnique.mockResolvedValue(null)
      global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

      await expect(getFxSnapshot()).rejects.toBeInstanceOf(FxUnavailableError)
      expect(upsert).not.toHaveBeenCalled()
    })

    it('never invents a rate when the database is unreachable and the provider also fails', async () => {
      findUnique.mockRejectedValue(new Error('connect ECONNREFUSED'))
      global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

      await expect(getFxSnapshot()).rejects.toBeInstanceOf(FxUnavailableError)
    })

    it('still uses a fetched live rate when saving it fails', async () => {
      findUnique.mockResolvedValue(null)
      upsert.mockRejectedValue(new Error('connect ECONNREFUSED'))
      global.fetch = vi.fn().mockResolvedValue(okProviderResponse(95.1)) as unknown as typeof fetch

      const snapshot = await getFxSnapshot()

      expect(snapshot).toEqual({ rate: 95.1, updatedAt: NOW.toISOString(), source: 'live' })
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
