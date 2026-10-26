import { describe, it, expect } from 'vitest'
import { applyRevision, describeApplied, readSnapshot, resolveRevision, type SnapshotLine } from '@/lib/account-revise'
import type { DraftLine } from '@/lib/quick-entry'

const snap = (id: string, name: string, over: Partial<SnapshotLine> = {}): SnapshotLine => ({
  id, country: 'IN', kind: 'asset', type: null, name, institution: name.split(' ')[0], amount: null, currency: 'INR', ...over,
})
const LIST = [
  snap('a', 'HDFC Bank account 1'),
  snap('b', 'HDFC Bank account 2'),
  snap('c', 'Axis Bank NRE Fixed Deposit', { type: 'fd_nre', amount: 500000 }),
]
const full = (s: SnapshotLine): DraftLine => ({ ...s })

describe('ambiguity: either everything is clear or nothing changes', () => {
  it('two matches with no "all" → ambiguous, no updates and no adds', () => {
    const r = resolveRevision(LIST, {
      changes: [
        { action: 'update', phrase: 'HDFC', matches: ['L1', 'L2'], all: false, set: { type: 'nre' } },
        { action: 'add', group: 'IN_asset', type: 'property', name: 'Flat in Hyderabad' },
      ],
    })
    expect(r.ambiguous).toMatch(/HDFC Bank account 1, HDFC Bank account 2/)
    expect(r.updates).toEqual([])
    expect(r.adds).toEqual([])
    const a = applyRevision(LIST.map(full), r)
    expect(a.changedIds).toEqual([])
    expect(a.lines).toEqual(LIST.map(full))
  })

  it('the model picks one HDFC line when the words fit both → still ambiguous', () => {
    const r = resolveRevision(LIST, {
      changes: [{ action: 'update', phrase: 'the HDFC account', matches: ['L1'], all: false, set: { type: 'nre' } }],
    })
    expect(r.ambiguous).toBeTruthy()
  })

  it('a phrase that names one line is not ambiguous', () => {
    const r = resolveRevision(LIST, {
      changes: [{ action: 'update', phrase: 'HDFC account 2', matches: ['L2'], all: false, set: { type: 'nro' } }],
    })
    expect(r.ambiguous).toBeUndefined()
    expect(r.updates).toEqual([{ id: 'b', patch: { type: 'nro' } }])
  })

  it('"the HDFC ones are NRE and NRO" assigns in list order', () => {
    const r = resolveRevision(LIST, {
      changes: [{ action: 'update', phrase: 'the HDFC ones', matches: ['L2', 'L1'], all: true, setInOrder: [{ type: 'nre' }, { type: 'nro' }] }],
    })
    expect(r.updates).toEqual([
      { id: 'a', patch: { type: 'nre' } },
      { id: 'b', patch: { type: 'nro' } },
    ])
    const a = applyRevision(LIST.map(full), r)
    expect(a.lines.map((l) => l.type)).toEqual(['nre', 'nro', 'fd_nre'])
    expect(a.changedIds).toEqual(['a', 'b'])
  })

  it('in-order changes whose counts do not line up are ambiguous', () => {
    const r = resolveRevision(LIST, {
      changes: [{ action: 'update', phrase: 'HDFC', matches: ['L1', 'L2'], all: true, setInOrder: [{ type: 'nre' }] }],
    })
    expect(r.ambiguous).toBeTruthy()
  })

  it('"all" applies the same change to every match', () => {
    const r = resolveRevision(LIST, {
      changes: [{ action: 'update', phrase: 'HDFC', matches: ['L1', 'L2'], all: true, set: { type: 'nre' } }],
    })
    expect(r.updates.map((u) => u.id)).toEqual(['a', 'b'])
  })
})

describe('adding and changing', () => {
  it('also a flat in Hyderabad → one new India property line', () => {
    const r = resolveRevision(LIST, {
      changes: [{ action: 'add', group: 'IN_asset', type: 'property', name: 'Flat in Hyderabad' }],
    })
    const a = applyRevision(LIST.map(full), r)
    expect(a.added).toBe(1)
    expect(a.lines).toHaveLength(4)
    expect(a.lines[3]).toMatchObject({ country: 'IN', type: 'property', name: 'Flat in Hyderabad' })
    expect(a.changedIds).toEqual([a.lines[3].id])
    expect(describeApplied(a)).toMatch(/Added 1 account/)
  })

  it('an unknown line, bad ids and model junk are ignored', () => {
    const r = resolveRevision(LIST, {
      changes: [
        { action: 'update', phrase: 'Citi', matches: ['L9'], set: { type: 'checking' } },
        { action: 'update', phrase: 'x', matches: ['L3'], set: { type: 'not_a_type', amount: -5, interestRate: 500, maturityDate: 'soon' } },
        null,
        'x',
      ],
    })
    expect(r.notFound).toEqual(['Citi'])
    expect(r.updates).toEqual([{ id: 'c', patch: {} }])
    expect(applyRevision(LIST.map(full), r).changedIds).toEqual([])
  })

  it('a type that does not fit the line is skipped and reported, not forced', () => {
    const a = applyRevision(LIST.map(full), { adds: [], updates: [{ id: 'a', patch: { type: 'checking' } }] })
    expect(a.lines[0].type).toBeNull()
    expect(a.changedIds).toEqual([])
    expect(a.skipped[0]).toMatch(/doesn’t fit/)
  })

  it('setting what is already there is not a change', () => {
    const a = applyRevision(LIST.map(full), { adds: [], updates: [{ id: 'c', patch: { type: 'fd_nre', amount: 500000 } }] })
    expect(a.changedIds).toEqual([])
  })

  it('a line removed while the AI was thinking is skipped', () => {
    const a = applyRevision(LIST.slice(1).map(full), { adds: [], updates: [{ id: 'a', patch: { type: 'nre' } }] })
    expect(a.changedIds).toEqual([])
  })

  it('amounts keep the currency they were said in', () => {
    const a = applyRevision(LIST.map(full), { adds: [], updates: [{ id: 'a', patch: { amount: 25000, currency: 'USD' } }] })
    expect(a.lines[0]).toMatchObject({ amount: 25000, currency: 'USD' })
  })
})

describe('readSnapshot', () => {
  it('rejects non-lists, duplicate ids and oversized lists', () => {
    expect(readSnapshot('x')).toBeNull()
    expect(readSnapshot([{ id: 'a' }, { id: 'a' }])).toBeNull()
    expect(readSnapshot(Array.from({ length: 61 }, (_, i) => ({ id: String(i) })))).toBeNull()
    expect(readSnapshot([{ id: '' }])).toBeNull()
  })
  it('cleans fields', () => {
    expect(readSnapshot([{ id: 'a', country: 'FR', type: 'bogus', amount: -3, name: 5 }])).toEqual([
      { id: 'a', country: null, kind: 'asset', type: null, name: '', institution: '', amount: null, currency: 'INR' },
    ])
  })
})
