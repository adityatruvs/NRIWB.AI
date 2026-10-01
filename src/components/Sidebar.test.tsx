// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-09-25T12:00:00.000Z')
/** ISO string for `ms` before NOW — matches the fixed-clock pattern in lib/freshness.test.ts. */
const before = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

const useCurrency = vi.fn()

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('@/context/CurrencyContext', () => ({ useCurrency: () => useCurrency() }))

const { default: Sidebar } = await import('./Sidebar')

describe('Sidebar — FX badge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    cleanup()
    useCurrency.mockReset()
    vi.useRealTimers()
  })

  it('shows a genuine "Updated Xm ago" stamp instead of a fake "live" badge', () => {
    useCurrency.mockReturnValue({ rate: 87.5, updatedAt: before(5 * 60_000), source: 'cached' })

    render(<Sidebar />)

    expect(screen.getByText('Updated 5m ago')).toBeInTheDocument()
    expect(screen.queryByText('live')).not.toBeInTheDocument()
    expect(screen.getByText('₹87.50')).toBeInTheDocument()
  })

  it('marks the rate stale (no green dot) once it is older than 2 hours', () => {
    useCurrency.mockReturnValue({ rate: 83.5, updatedAt: before(3 * 3600_000), source: 'cached' })

    render(<Sidebar />)

    const dot = screen.getByText('Updated 3h ago').firstElementChild
    expect(dot).toHaveClass('bg-muted-foreground/40')
    expect(dot).not.toHaveClass('bg-success')
  })

  it('shows a green dot when the rate was refreshed within the last 2 hours', () => {
    useCurrency.mockReturnValue({ rate: 83.5, updatedAt: before(5 * 60_000), source: 'cached' })

    render(<Sidebar />)

    const dot = screen.getByText('Updated 5m ago').firstElementChild
    expect(dot).toHaveClass('bg-success')
  })

  it('says "no live rate yet" before the first fetch resolves, rather than claiming to be live', () => {
    useCurrency.mockReturnValue({ rate: 83.5, updatedAt: null, source: 'fallback' })

    render(<Sidebar />)

    expect(screen.getByText('no live rate yet')).toBeInTheDocument()
    expect(screen.queryByText('live')).not.toBeInTheDocument()
  })
})
