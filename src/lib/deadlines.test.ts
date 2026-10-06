import { describe, it, expect } from 'vitest'
import { upcomingDeadlines, datePromptBlock, resolveToday, fbarDueMeta } from '@/lib/deadlines'

const SEP_25_2026 = new Date('2026-09-25T15:00:00Z') // the bug report's test date

describe('dated deadlines', () => {
  it('on Sep 25, 2026 the 2025 FBAR is still open until its extended date, Oct 15', () => {
    const next90 = upcomingDeadlines(SEP_25_2026, 90)
    const fbar = next90.find((d) => d.title.startsWith('FBAR (FinCEN 114) for 2025'))
    expect(fbar).toMatchObject({ date: '2026-10-15', daysAway: 20 })
    // Its April 15 original date has passed, so it isn't listed again.
    expect(next90.filter((d) => d.title.includes('FBAR'))).toHaveLength(1)
    expect(next90.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-15', '2026-12-15']) // Dec 31 is day 97
  })

  it('moves US dates off weekends (Apr 15, 2028 is a Saturday)', () => {
    const fbar = upcomingDeadlines(new Date('2028-01-01T00:00:00Z')).find((d) => d.title === 'FBAR (FinCEN 114) for 2027')
    expect(fbar?.date).toBe('2028-04-17')
  })

  it("puts today's date in the prompt", () => {
    expect(datePromptBlock(SEP_25_2026)).toMatch(/^Today is Friday, September 25, 2026 \(2026-09-25\)\./)
  })

  it("uses the browser's date only when it's within a day of the server's", () => {
    expect(resolveToday('2026-09-24', SEP_25_2026).toISOString().slice(0, 10)).toBe('2026-09-24')
    expect(resolveToday('2024-01-01', SEP_25_2026)).toBe(SEP_25_2026)
    expect(resolveToday('garbage', SEP_25_2026)).toBe(SEP_25_2026)
  })

  it("dates the FBAR item for this year's balances", () => {
    expect(fbarDueMeta(SEP_25_2026)).toBe('2026 FBAR due Apr 15, 2027 (ext. Oct 15)')
  })
})
