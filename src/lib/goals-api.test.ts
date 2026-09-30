import { describe, it, expect } from 'vitest'
import { ALL_GOAL_CATEGORIES } from '@/lib/goals'
import {
  GOAL_CATEGORIES,
  createGoalSchema,
  updateGoalSchema,
  targetYearError,
  toGoal,
  toCreateData,
  toUpdateData,
  releaseClaims,
  prepareImport,
  formatZodError,
  type GoalRecord,
} from '@/lib/goals-api'

function row(overrides: Partial<GoalRecord> = {}): GoalRecord {
  return {
    id: 'g1',
    name: 'Retirement',
    category: 'retirement',
    kind: null,
    targetUsd: 2_000_000,
    currentUsd: 0,
    targetYear: 2045,
    linkedAccountIds: [],
    plannedMonthlyUsd: null,
    linkedLiabilityId: null,
    originalAmount: null,
    ...overrides,
  }
}

const valid = { name: 'Home', category: 'property', targetUsd: 100_000, targetYear: 2030 }

describe('GOAL_CATEGORIES', () => {
  it('matches every category the UI renders', () => {
    expect([...GOAL_CATEGORIES].sort()).toEqual([...ALL_GOAL_CATEGORIES].sort())
  })
})

describe('createGoalSchema', () => {
  it('applies defaults', () => {
    const g = createGoalSchema.parse(valid)
    expect(g.currentUsd).toBe(0)
    expect(g.linkedAccountIds).toEqual([])
  })

  it.each([
    ['empty name', { ...valid, name: '  ' }, 'name'],
    ['zero target', { ...valid, targetUsd: 0 }, 'targetUsd'],
    ['negative current', { ...valid, currentUsd: -1 }, 'currentUsd'],
    ['unknown category', { ...valid, category: 'yacht' }, 'category'],
    ['year after 2100', { ...valid, targetYear: 2101 }, 'targetYear'],
    ['fractional year', { ...valid, targetYear: 2030.5 }, 'targetYear'],
  ])('rejects %s with a readable message', (_label, body, field) => {
    const res = createGoalSchema.safeParse(body)
    expect(res.success).toBe(false)
    if (!res.success) expect(formatZodError(res.error)).toContain(field)
  })

  it('accepts a client uuid but not an arbitrary id', () => {
    expect(createGoalSchema.safeParse({ ...valid, id: crypto.randomUUID() }).success).toBe(true)
    expect(createGoalSchema.safeParse({ ...valid, id: 'someone-elses-id' }).success).toBe(false)
  })
})

describe('targetYearError', () => {
  it('allows the current year through 2100', () => {
    expect(targetYearError(2026, 2026)).toBeNull()
    expect(targetYearError(2100, 2026)).toBeNull()
  })
  it('rejects past years and years after 2100', () => {
    expect(targetYearError(2025, 2026)).toMatch(/between 2026 and 2100/)
    expect(targetYearError(2101, 2026)).toMatch(/between/)
  })
  it('lets an overdue goal keep its unchanged year', () => {
    expect(targetYearError(2020, 2026, 2020)).toBeNull()
    expect(targetYearError(2021, 2026, 2020)).not.toBeNull()
  })
})

describe('toGoal', () => {
  it('omits empty optional fields', () => {
    const g = toGoal(row())
    expect(g).toEqual({
      id: 'g1',
      name: 'Retirement',
      category: 'retirement',
      targetUsd: 2_000_000,
      currentUsd: 0,
      targetYear: 2045,
    })
  })
  it('carries kind, links and planned contribution when set', () => {
    const g = toGoal(row({ kind: 'cost', linkedAccountIds: ['a1'], plannedMonthlyUsd: 500 }))
    expect(g.kind).toBe('cost')
    expect(g.linkedAccountIds).toEqual(['a1'])
    expect(g.plannedMonthlyUsd).toBe(500)
  })
  it('falls back safely on unknown stored values', () => {
    const g = toGoal(row({ category: 'legacy', kind: 'weird' }))
    expect(g.category).toBe('other')
    expect(g).not.toHaveProperty('kind')
  })
})

describe('toCreateData / toUpdateData', () => {
  it('scopes to the user and dedupes links', () => {
    const data = toCreateData(createGoalSchema.parse({ ...valid, linkedAccountIds: ['a', 'a', 'b'] }), 'u1')
    expect(data.userId).toBe('u1')
    expect(data.linkedAccountIds).toEqual(['a', 'b'])
    expect(data.kind).toBeNull()
    expect(data).not.toHaveProperty('id')
  })
  it('only writes fields present in the patch; null clears', () => {
    const data = toUpdateData(updateGoalSchema.parse({ name: 'New', kind: null, plannedMonthlyUsd: null }))
    expect(data).toEqual({ name: 'New', kind: null, plannedMonthlyUsd: null })
  })
})

describe('releaseClaims', () => {
  const goals = [
    { id: 'g1', linkedAccountIds: ['a', 'b'] },
    { id: 'g2', linkedAccountIds: ['c'] },
    { id: 'g3' },
  ]
  it('strips claimed accounts from other goals only', () => {
    expect(releaseClaims(goals, 'g2', ['b', 'c'])).toEqual([{ id: 'g1', linkedAccountIds: ['a'] }])
  })
  it('is a no-op without claims', () => {
    expect(releaseClaims(goals, 'g1', [])).toEqual([])
    expect(releaseClaims(goals, 'g1', undefined)).toEqual([])
  })
})

describe('prepareImport', () => {
  const owned = new Set(['a1', 'a2'])

  it('imports valid goals, dropping invalid entries', () => {
    const out = prepareImport([valid, { name: '' }, 'junk', null], [], owned)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Home')
  })

  it('is idempotent: goals already on the server are skipped', () => {
    const first = prepareImport([valid], [], owned)
    const again = prepareImport([valid], first.map((g) => ({ ...g })), owned)
    expect(again).toEqual([])
  })

  it('dedupes within one batch', () => {
    expect(prepareImport([valid, { ...valid, name: ' home ' }], [], owned)).toHaveLength(1)
  })

  it('drops links to unowned or already-claimed accounts', () => {
    const existing = [{ ...row(), linkedAccountIds: ['a2'] }]
    const out = prepareImport(
      [
        { ...valid, linkedAccountIds: ['a1', 'stranger', 'a2'] },
        { ...valid, name: 'Other', linkedAccountIds: ['a1'] },
      ],
      existing,
      owned,
    )
    expect(out[0].linkedAccountIds).toEqual(['a1'])
    expect(out[1].linkedAccountIds).toEqual([])
  })

  it('keeps past target years from old data', () => {
    expect(prepareImport([{ ...valid, targetYear: 2020 }], [], owned)).toHaveLength(1)
  })
})
