import { beforeEach, describe, expect, it, vi } from 'vitest'

const getFxSnapshot = vi.fn()

vi.mock('@/lib/fx', () => ({
  getFxSnapshot: (...args: unknown[]) => getFxSnapshot(...args),
}))

const { GET } = await import('./route')

describe('GET /api/fx', () => {
  beforeEach(() => {
    getFxSnapshot.mockReset()
  })

  it('returns whatever snapshot getFxSnapshot resolves, unmodified', async () => {
    getFxSnapshot.mockResolvedValue({ rate: 83.42, updatedAt: '2026-09-25T10:00:00.000Z', source: 'cached' })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rate: 83.42, updatedAt: '2026-09-25T10:00:00.000Z', source: 'cached' })
  })

  it('passes through the fallback snapshot as-is (no special-casing here — lib/fx owns that)', async () => {
    getFxSnapshot.mockResolvedValue({ rate: 83.5, updatedAt: null, source: 'fallback' })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rate: 83.5, updatedAt: null, source: 'fallback' })
  })
})
