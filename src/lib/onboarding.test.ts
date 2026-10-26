import { describe, it, expect } from 'vitest'
import { validateName, validatePhone, missingProfileFields, parseOnboarding } from '@/lib/onboarding'

describe('validateName', () => {
  it('accepts ordinary, hyphenated, apostrophe and accented names', () => {
    for (const n of ['Priya', 'K', 'Mary-Jane', "O'Brien", 'José', 'Anne Marie', 'தமிழ்']) {
      expect(validateName(n, 'First name')).toBe('')
    }
  })

  it('rejects empty, punctuation-only, digits, symbols and over-long names with a clear message', () => {
    expect(validateName('  ', 'First name')).toBe('First name is required.')
    expect(validateName('.', 'Last name')).toMatch(/only contain letters/)
    expect(validateName('R2D2', 'First name')).toMatch(/only contain letters/)
    expect(validateName('<script>', 'First name')).toMatch(/only contain letters/)
    expect(validateName('-Priya', 'First name')).toMatch(/only contain letters/)
    expect(validateName('a'.repeat(51), 'Last name')).toMatch(/50 characters/)
  })
})

describe('validatePhone', () => {
  it('treats a blank phone as fine (the field is optional)', () => {
    expect(validatePhone('')).toBe('')
    expect(validatePhone('   ')).toBe('')
  })

  it('accepts common US and India formats', () => {
    for (const p of ['+1 (555) 000-0000', '555-123-4567', '+91 98765 43210', '9876543210', '555.123.4567']) {
      expect(validatePhone(p)).toBe('')
    }
  })

  it('rejects letters, stray symbols, misplaced + and bad lengths', () => {
    expect(validatePhone('call me')).toMatch(/valid phone/)
    expect(validatePhone('555-CALL-NOW')).toMatch(/valid phone/)
    expect(validatePhone('555+1234567')).toMatch(/valid phone/)
    expect(validatePhone('12345')).toMatch(/too short/)
    expect(validatePhone('+1 234 567 890 123 456 7')).toMatch(/too long/)
  })
})

describe('parseOnboarding validation', () => {
  const base = {
    firstName: 'Priya',
    lastName: 'Sharma',
    dateOfBirth: '1990-04-02',
    countryOfResidence: 'US',
    usImmigrationStatus: 'h1b',
    indiaTaxResidency: 'nri',
  }

  it('accepts a valid payload and rejects bad names / phones server-side', () => {
    expect('profile' in parseOnboarding(base)).toBe(true)
    expect(parseOnboarding({ ...base, firstName: '123' })).toEqual({
      error: 'First name can only contain letters, spaces, hyphens and apostrophes.',
    })
    expect(parseOnboarding({ ...base, phone: 'abc' })).toHaveProperty('error')
  })
})

describe('missingProfileFields', () => {
  it('lists skipped questions and treats empty arrays as skipped', () => {
    const missing = missingProfileFields({ riskTolerance: 'moderate', goals: [], holdings: ['gold'] })
    expect(missing).toContain('Financial goals')
    expect(missing).toContain('Household income')
    expect(missing).not.toContain('Risk tolerance')
    expect(missing).not.toContain('Current holdings')
  })

  it('is empty once everything is answered', () => {
    expect(
      missingProfileFields({
        planningHorizon: 'undecided', usFilingStatus: 'single', filesTaxesIn: 'us', hasSsnOrItin: 'yes',
        hasPan: 'yes', foreignAccountsOver10k: 'no', ownsForeignFunds: 'no', incomeRange: 'lt_50k',
        netWorthRange: 'lt_100k', riskTolerance: 'moderate', goals: ['travel'], holdings: ['gold'],
        targetRetirementAge: 60, maritalStatus: 'single', supportsParentsIndia: 'no', sendsRemittances: 'no',
      }),
    ).toEqual([])
  })
})
