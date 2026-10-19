// @vitest-environment jsdom
import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CurrencyProvider, useCurrency, REFRESH_INTERVAL_MS } from './CurrencyContext'

function Probe() {
  const { rate, updatedAt } = useCurrency()
  return (
    <div>
      <span data-testid="rate">{rate}</span>
      <span data-testid="updatedAt">{updatedAt ?? 'null'}</span>
    </div>
  )
}

function renderProbe() {
  return render(
    <CurrencyProvider>
      <Probe />
    </CurrencyProvider>,
  )
}

describe('CurrencyProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('never shows a made-up rate: with no server rate it waits for /api/fx', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch // never resolves

    renderProbe()

    expect(screen.queryByTestId('rate')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/live USD \/ INR rate/)
  })

  it('uses the live rate the server passed in from the first render', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch

    render(
      <CurrencyProvider initialRate={95.1} initialUpdatedAt="2026-10-06T09:00:00.000Z">
        <Probe />
      </CurrencyProvider>,
    )

    expect(screen.getByTestId('rate').textContent).toBe('95.1')
  })

  it('adopts the server snapshot once /api/fx resolves', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rate: 88.2, updatedAt: '2026-09-25T10:00:00.000Z', source: 'cached' }),
    }) as unknown as typeof fetch

    await act(async () => {
      renderProbe()
      await Promise.resolve()
    })

    expect(screen.getByTestId('rate').textContent).toBe('88.2')
    expect(screen.getByTestId('updatedAt').textContent).toBe('2026-09-25T10:00:00.000Z')
  })

  it('keeps the last-known rate when /api/fx fails, without surfacing the error to the UI', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => {
      render(
        <CurrencyProvider initialRate={94.8}>
          <Probe />
        </CurrencyProvider>,
      )
      await Promise.resolve()
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('rate').textContent).toBe('94.8')
    expect(console.error).toHaveBeenCalled()
  })

  it('re-polls /api/fx on the refresh interval so a long-lived tab picks up the cron refresh', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rate: 90, updatedAt: '2026-09-25T10:00:00.000Z', source: 'live' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await act(async () => {
      renderProbe()
      await vi.advanceTimersByTimeAsync(0) // flush the mount-time loadRate()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
