import { describe, it, expect } from 'vitest'
import { grossUsd, usdValue, fbarStatus, netWorth, type Holding } from '@/lib/portfolio'
import { recordedFbarPeak } from '@/lib/fbar'
import { buildHistory } from '@/lib/networth-history'
import { balancesFromEntry, entryAmount } from '@/lib/account-details'

// An FCNR deposit is held in dollars: its USD value stays put when the rupee
// moves, and its rupee value is what changes. Other India holdings are the reverse.

const h = (over: Partial<Holding>): Holding => ({
  nickname: 'x',
  institution: 'y',
  accountType: 'fcnr',
  country: 'IN',
  balanceUsd: 0,
  balanceInr: 0,
  isPfic: false,
  source: 'manual',
  ...over,
})
// Saved at ₹95: $50,000 FCNR, and a ₹9.5L NRE ($10,000 at the time).
const fcnr = h({ id: 'f', ...balancesFromEntry('IN', 'fcnr', 50_000, 95) })
const nre = h({ id: 'n', accountType: 'nre', ...balancesFromEntry('IN', 'nre', 950_000, 95) })

describe('FCNR keeps its dollar value when the rate moves', () => {
  it('is $50,000 at ₹95 and still $50,000 at ₹100 (an NRE account moves instead)', () => {
    expect(usdValue(fcnr, 95)).toBe(50_000)
    expect(usdValue(fcnr, 100)).toBe(50_000)
    expect(usdValue(nre, 100)).toBe(9_500)
    expect(netWorth([fcnr, nre], 100).inUsd).toBe(59_500)
  })

  it('an older FCNR row saved with rupees only falls back to them', () => {
    const legacy = h({ balanceUsd: 0, balanceInr: 4_750_000 })
    expect(grossUsd(legacy, 95)).toBe(50_000)
    expect(entryAmount(legacy, 95)).toBe(50_000)
  })

  it('FBAR counts it in dollars, from today and from snapshots', () => {
    expect(fbarStatus([fcnr, nre], 100).currentUsd).toBe(59_500)
    const recorded = recordedFbarPeak(
      [fcnr, nre],
      [{ accountId: 'f', day: '2026-03-01', balanceUsd: 60_000, balanceInr: 60_000 * 83 }],
      100,
      2026,
    )
    expect(recorded?.usd).toBe(60_000 + 9_500)
  })

  it('the net-worth history values its snapshots in dollars too', () => {
    const hist = buildHistory({
      accounts: [{ id: 'f', country: 'IN', accountType: 'fcnr', liability: false }],
      snapshots: [{ accountId: 'f', day: '2026-09-30', balanceUsd: 50_000, balanceInr: 50_000 * 83 }],
      rate: 100,
      range: '90d',
      today: '2026-09-30',
    })
    expect(hist.points.at(-1)?.in).toBe(50_000)
  })
})
