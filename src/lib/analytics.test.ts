import { describe, it, expect } from 'vitest'
import { cleanProps } from '@/lib/analytics'

describe('product events carry numbers only', () => {
  it('unknown events are refused', () => {
    expect(cleanProps('page_view', {})).toBeNull()
  })
  it('keeps allowed numeric properties and drops everything else', () => {
    expect(
      cleanProps('tell_us_saved', {
        accounts: 7,
        type_fixes: 2,
        ms_to_first_save: 41234.6,
        is_first_save: 1,
        first_ledger: 0,
        nickname: 'HDFC NRE',
        balance: 5000000,
        institution: 'HDFC',
      }),
    ).toEqual({ accounts: 7, type_fixes: 2, ms_to_first_save: 41235, is_first_save: 1, first_ledger: 0 })
  })
  it('drops strings, negatives, NaN and non-objects', () => {
    expect(cleanProps('tell_us_saved', { accounts: '7', type_fixes: -1, ms_to_first_save: NaN })).toEqual({})
    expect(cleanProps('tell_us_opened', null)).toEqual({})
  })
})
