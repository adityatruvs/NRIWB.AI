import { beforeEach, describe, expect, it, vi } from 'vitest'

const getFxSnapshot = vi.fn()

vi.mock('@/lib/fx', async (orig) => ({
  ...(await orig<typeof import('@/lib/fx')>()),
  getFxSnapshot: (...args: unknown[]) => getFxSnapshot(...args),
}))
const { FxUnavailableError } = await import('@/lib/fx')

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

  it('answers 503 (not a made-up rate) when there is no live or saved rate', async () => {
    getFxSnapshot.mockRejectedValue(new FxUnavailableError('network down'))

    const res = await GET()

    expect(res.status).toBe(503)
    expect((await res.json()).rate).toBeUndefined()
  })
})
