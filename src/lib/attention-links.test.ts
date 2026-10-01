import { describe, it, expect } from 'vitest'
import { attentionHref, withHrefs, isAttentionKey, ATTENTION_KEYS } from '@/lib/attention-links'
import { complianceItems, type Holding } from '@/lib/portfolio'

const h = (over: Partial<Holding>): Holding => ({
  nickname: 'x',
  institution: 'y',
  accountType: 'savings',
  country: 'IN',
  balanceUsd: 0,
  balanceInr: 1_000_000,
  isPfic: false,
  source: 'manual',
  ...over,
})

const holdings = [
  h({ id: 'sbi', accountType: 'nre' }),
  h({ id: 'mf1', accountType: 'mutual_fund', isPfic: true }),
  h({ id: 'nro1', accountType: 'nro' }),
  h({ id: 'loan1', accountType: 'home_loan', kind: 'liability' }),
]

describe('attentionHref', () => {
  it('maps each rule to its fix location', () => {
    expect(attentionHref('fbar', holdings)).toBe('/accounts?country=IN')
    expect(attentionHref('fatca', holdings)).toBe('/accounts?country=IN')
    expect(attentionHref('pfic', holdings)).toBe('/accounts?focus=mf1')
    expect(attentionHref('nro_tds', holdings)).toBe('/accounts?focus=nro1')
    expect(attentionHref('stale', holdings)).toBe('/accounts?sort=stale')
    expect(attentionHref('debt_currency', holdings)).toBe('/accounts?section=debt')
  })

  it('falls back to the India view when the specific account is missing', () => {
    expect(attentionHref('pfic', [])).toBe('/accounts?country=IN')
    expect(attentionHref('nro_tds', [])).toBe('/accounts?country=IN')
  })

  it('every key is handled without throwing', () => {
    for (const k of ATTENTION_KEYS) expect(() => attentionHref(k, holdings)).not.toThrow()
  })
})

describe('withHrefs', () => {
  it('links every rule-based item', () => {
    const items = withHrefs(complianceItems(holdings, 83), holdings)
    expect(items.length).toBeGreaterThan(0)
    for (const it of items) expect(it.href).toMatch(/^\/accounts/)
  })

  it('leaves unknown (model-invented) keys unlinked', () => {
    const [item] = withHrefs([{ key: 'https://evil.example' }, { key: 'ai-3' }], holdings)
    expect(item).not.toHaveProperty('href')
    expect(isAttentionKey('javascript:alert(1)')).toBe(false)
  })
})
