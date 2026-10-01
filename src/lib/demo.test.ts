import { describe, it, expect } from 'vitest'
import { DEMO_HOLDINGS } from '@/lib/demo'
import { byAssetClass } from '@/lib/portfolio'

describe('demo seed', () => {
  // Regression: "HDFC NRE FD" was typed `nre`, so it landed under Cash & Banking
  // while "SBI Fixed Deposit" sat under Fixed Deposits — same product, split in two.
  it('files every fixed deposit under Fixed Deposits, with its scheme in details', () => {
    const fds = DEMO_HOLDINGS.filter((h) => /\bFD\b|Fixed Deposit/i.test(h.nickname))
    expect(fds.length).toBeGreaterThanOrEqual(2)
    for (const fd of fds) {
      expect(fd.accountType).toBe('fd')
      expect(fd.details?.fdScheme).toMatch(/^(NRE|NRO)$/)
    }
    const fdSlice = byAssetClass(fds, 83.5)
    expect(fdSlice.map((s) => s.key)).toEqual(['fixedDeposits'])
  })
})
