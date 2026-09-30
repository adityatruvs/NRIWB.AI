import { describe, it, expect } from 'vitest'
import { recordedFbarPeak } from '@/lib/fbar'
import { fbarStatus, fbarBasisPhrase, complianceItems, type Holding } from '@/lib/portfolio'

const RATE = 80
const h = (over: Partial<Holding>): Holding => ({
  nickname: 'x',
  institution: 'y',
  accountType: 'nre',
  country: 'IN',
  balanceUsd: 0,
  balanceInr: 0,
  isPfic: false,
  source: 'manual',
  ...over,
})
const nre = h({ id: 'a', balanceInr: 800_000 }) // $10,000 today
const fd = h({ id: 'b', accountType: 'fd', balanceInr: 400_000 }) // $5,000 today
const loan = h({ id: 'l', accountType: 'home_loan', kind: 'liability', balanceInr: 9_000_000 })

describe('fbarStatus', () => {
  it('without history, reports current balances as they are, with no markup', () => {
    const f = fbarStatus([nre, fd, loan], RATE)
    expect(f.basis).toBe('current')
    expect(f.currentUsd).toBe(15_000)
    expect(f.peakUsd).toBe(15_000)
    expect(f.since).toBeNull()
  })

  it('with history, uses the recorded maxima (never below today)', () => {
    const recorded = recordedFbarPeak(
      [nre, fd],
      [
        { accountId: 'a', day: '2026-02-01', balanceInr: 1_200_000 }, // $15,000 peak
        { accountId: 'b', day: '2026-02-01', balanceInr: 100_000 }, // below today's $5,000
      ],
      RATE,
      2026,
    )
    expect(recorded).toEqual({ usd: 20_000, since: '2026-02-01' })
    const f = fbarStatus([nre, fd], RATE, recorded)
    expect(f.basis).toBe('recorded')
    expect(f.peakUsd).toBe(20_000)
  })

  it('ignores other years, debts and other accounts', () => {
    expect(
      recordedFbarPeak(
        [nre, loan],
        [
          { accountId: 'a', day: '2025-12-31', balanceInr: 9_999_999 },
          { accountId: 'l', day: '2026-01-05', balanceInr: 9_999_999 },
          { accountId: 'zz', day: '2026-01-05', balanceInr: 9_999_999 },
        ],
        RATE,
        2026,
      ),
    ).toBeNull()
  })
})

describe('FBAR attention item wording', () => {
  it('never says "peaked" when only current balances are known, and says update dates are unknown', () => {
    const [item] = complianceItems([nre, fd], RATE)
    expect(item.detail).toBe(
      'India accounts total $15,000 at balances as entered (update date not recorded), above the $10,000 threshold. Filing required.',
    )
    expect(item.detail).not.toMatch(/peak/i)
  })

  it('says when the balances were last updated (the ticket: "as entered on [date]")', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    const dated = [
      { ...nre, lastSyncedAt: '2026-03-03T09:00:00Z' },
      { ...fd, lastSyncedAt: '2025-11-20T09:00:00Z' },
    ]
    expect(fbarBasisPhrase(fbarStatus(dated, RATE), now)).toBe(
      'India accounts total $15,000 at balances last updated between Nov 20, 2025 and Mar 3',
    )
    expect(fbarBasisPhrase(fbarStatus([dated[0]], RATE), now)).toBe(
      'India accounts total $10,000 at balances last updated Mar 3',
    )
  })

  it('notes the yearly maximum may be higher when under the limit', () => {
    const [item] = complianceItems([fd], RATE)
    expect(item.detail).toContain('50% of the $10,000 limit')
    expect(item.detail).toContain('may be higher')
  })

  it('names the source and start date when history exists', () => {
    const [item] = complianceItems([nre], RATE, { usd: 12_500, since: '2026-03-03' })
    expect(item.detail).toBe('Highest India balances recorded since Mar 3: $12,500 combined, above the $10,000 threshold. Filing required.')
  })
})
