import { describe, expect, it } from 'vitest'
import { clerkLocalization } from './clerk-localization'

describe('clerkLocalization', () => {
  it('labels the social-login section "Connected login accounts"', () => {
    expect(clerkLocalization.userProfile.start.connectedAccountsSection.title).toBe(
      'Connected login accounts',
    )
  })

  it('does not reuse the bare "Connected accounts" wording used for financial accounts', () => {
    const title = clerkLocalization.userProfile.start.connectedAccountsSection.title
    expect(title).not.toBe('Connected accounts')
    expect(title.toLowerCase()).toContain('login')
  })

  it('overrides only the connected accounts title', () => {
    expect(Object.keys(clerkLocalization)).toEqual(['userProfile'])
    expect(Object.keys(clerkLocalization.userProfile)).toEqual(['start'])
    expect(Object.keys(clerkLocalization.userProfile.start)).toEqual(['connectedAccountsSection'])
    expect(Object.keys(clerkLocalization.userProfile.start.connectedAccountsSection)).toEqual(['title'])
  })
})
