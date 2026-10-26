import { describe, it, expect } from 'vitest'
import { applyStrip, changeStripType, draftFromHolding, validateStrip } from '@/lib/edit-strip'
import type { Holding } from '@/lib/portfolio'

const RATE = 80
const fd: Holding = {
  id: 'x',
  nickname: 'HDFC NRE FD',
  institution: 'HDFC Bank',
  accountType: 'fd',
  country: 'IN',
  balanceUsd: 5_000_000 / RATE,
  balanceInr: 5_000_000,
  isPfic: false,
  source: 'manual',
  details: { fdScheme: 'NRE', interestRate: 7, compounding: 'quarterly' },
}
const loan: Holding = {
  id: 'l',
  nickname: 'Home loan',
  institution: 'HDFC',
  accountType: 'home_loan',
  country: 'IN',
  kind: 'liability',
  balanceUsd: 100,
  balanceInr: 8000,
  isPfic: false,
  source: 'manual',
  securedAgainstId: 'p',
}

describe('validation (same rules as the review list)', () => {
  it('a name, and a balance above zero', () => {
    const d = draftFromHolding(fd, RATE)
    expect(validateStrip(fd, d)).toEqual({})
    expect(validateStrip(fd, { ...d, name: '  ' }).name).toBeTruthy()
    expect(validateStrip(fd, { ...d, amount: '' }).amount).toBeTruthy()
    expect(validateStrip(fd, { ...d, amount: '0' }).amount).toBeTruthy()
    expect(validateStrip(fd, { ...d, amount: 'abc' }).amount).toBeTruthy()
    expect(validateStrip(fd, { ...d, amount: '40L' })).toEqual({})
  })
  it('rate 0–100, a real date, a positive payment', () => {
    const d = draftFromHolding(fd, RATE)
    expect(validateStrip(fd, { ...d, rate: '101' }).rate).toBeTruthy()
    expect(validateStrip(fd, { ...d, rate: '-1' }).rate).toBeTruthy()
    expect(validateStrip(fd, { ...d, rate: 'x' }).rate).toBeTruthy()
    expect(validateStrip(fd, { ...d, maturity: 'soon' }).maturity).toBeTruthy()
    const l = draftFromHolding(loan, RATE)
    expect(validateStrip(loan, { ...l, payment: '0' }).payment).toBeTruthy()
    expect(validateStrip(loan, { ...l, payment: '70k' })).toEqual({})
  })
  it('ignores fields the type does not have', () => {
    const nre: Holding = { ...fd, accountType: 'nre', details: undefined }
    expect(validateStrip(nre, { ...draftFromHolding(nre, RATE), maturity: 'junk', payment: 'junk' })).toEqual({})
  })
  it("a linked account's balance is not checked", () => {
    const linked: Holding = { ...fd, source: 'plaid' }
    expect(validateStrip(linked, { ...draftFromHolding(linked, RATE), amount: '' })).toEqual({})
  })
})

describe('saving', () => {
  it('an untouched draft changes nothing, even the balances', () => {
    expect(applyStrip(fd, draftFromHolding(fd, RATE), RATE)).toEqual(fd)
  })
  it("edits only the strip's fields and keeps the rest", () => {
    const d = { ...draftFromHolding(fd, RATE), name: 'Retirement FD', amount: '60L', rate: '7.25', maturity: '2027-03-01' }
    const h = applyStrip(fd, d, RATE)
    expect(h.nickname).toBe('Retirement FD')
    expect(h.balanceInr).toBe(6_000_000)
    expect(h.balanceUsd).toBeCloseTo(6_000_000 / RATE)
    expect(h.details).toEqual({ fdScheme: 'NRE', interestRate: 7.25, compounding: 'quarterly', maturityDate: '2027-03-01' })
  })
  it('clearing the rate removes it', () => {
    expect(applyStrip(fd, { ...draftFromHolding(fd, RATE), rate: '' }, RATE).details?.interestRate).toBeUndefined()
  })
  it('retyping keeps the money and drops what the new type lacks', () => {
    const h = applyStrip(fd, { ...draftFromHolding(fd, RATE), choice: 'fd_nro' }, RATE)
    expect(h.details?.fdScheme).toBe('NRO')
    expect(h.balanceInr).toBe(5_000_000)
    const s = applyStrip(fd, { ...draftFromHolding(fd, RATE), choice: 'nre' }, RATE)
    expect(s.accountType).toBe('nre')
    expect(s.details?.compounding).toBeUndefined()
  })
  it('FCNR is entered in dollars', () => {
    expect(changeStripType(fd, draftFromHolding(fd, RATE), 'fcnr', RATE).amount).toBe('62,500')
  })
  it('whose name: joint/family set it, just me clears it, other people are kept', () => {
    const base = draftFromHolding(fd, RATE)
    const j = applyStrip(fd, { ...base, ownership: 'joint', relation: 'spouse', person: ' Asha ' }, RATE)
    expect(j.ownership).toBe('joint')
    expect(j.coOwners).toEqual([{ relation: 'spouse', name: 'Asha' }])
    const two: Holding = { ...j, coOwners: [...j.coOwners!, { relation: 'father', name: 'R' }] }
    expect(applyStrip(two, { ...draftFromHolding(two, RATE), person: 'Asha K' }, RATE).coOwners).toHaveLength(2)
    const s = applyStrip(j, { ...draftFromHolding(j, RATE), ownership: 'self' }, RATE)
    expect(s.ownership).toBeUndefined()
    expect(s.coOwners).toBeUndefined()
  })
  it('a loan keeps its secured-against link and takes a monthly payment', () => {
    const h = applyStrip(loan, { ...draftFromHolding(loan, RATE), payment: '70k' }, RATE)
    expect(h.securedAgainstId).toBe('p')
    expect(h.details?.minPayment).toBe(70_000)
  })
  it("a linked balance is never changed from the strip", () => {
    const linked: Holding = { ...fd, source: 'plaid' }
    expect(applyStrip(linked, { ...draftFromHolding(linked, RATE), amount: '1' }, RATE).balanceInr).toBe(5_000_000)
  })
})
