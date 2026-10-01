/**
 * The /api/goals contract: zod validation + the Goal <-> DB row mapping.
 *
 * Pure (no Prisma, no request handling), mirroring `accounts-api.ts`: the route
 * handlers own auth, per-user scoping, ownership checks and the DB calls; this
 * module owns shape, validation and the "an account funds at most one goal" rule.
 */

import { z } from 'zod'
import type { Goal, GoalCategory, GoalKind } from '@/lib/goals'
export { releaseClaims } from '@/lib/goals'

export const GOAL_CATEGORIES = [
  'retirement', 'education', 'property', 'travel', 'emergency', 'other', 'debt',
] as const satisfies readonly GoalCategory[]

const KINDS = ['cost', 'investment'] as const satisfies readonly GoalKind[]

export const MAX_TARGET_YEAR = 2100

/** Most goals one import may carry — a guard, not a product limit. */
export const MAX_IMPORT = 100

const baseFields = {
  name: z.string().trim().min(1, 'name is required').max(120),
  category: z.enum(GOAL_CATEGORIES),
  // Nullable so a PATCH can clear an override back to the category default.
  kind: z.enum(KINDS).nullable(),
  targetUsd: z.number().positive('targetUsd must be greater than 0'),
  currentUsd: z.number().min(0, 'currentUsd cannot be negative'),
  targetYear: z
    .number()
    .int('targetYear must be a whole year')
    .min(1900)
    .max(MAX_TARGET_YEAR, `targetYear must be ${MAX_TARGET_YEAR} or earlier`),
  linkedAccountIds: z.array(z.string().min(1)).max(100),
  plannedMonthlyUsd: z.number().min(0, 'plannedMonthlyUsd cannot be negative').nullable(),
  linkedLiabilityId: z.string().min(1).nullable(),
  originalAmount: z.number().positive('originalAmount must be greater than 0').nullable(),
}

/**
 * Shape rules for how a goal links to accounts (ownership is checked in the DB):
 * a debt-payoff goal links exactly one loan and no assets; any other goal links
 * assets only, never a loan.
 */
export function linkRuleError(g: {
  category: string
  linkedAccountIds: string[]
  linkedLiabilityId: string | null
}): string | null {
  if (g.category === 'debt') {
    if (g.linkedAccountIds.length > 0) return 'linkedAccountIds: a debt payoff goal links a loan, not assets'
    // A null loan is allowed only once the loan has been deleted (see the route).
    return null
  }
  if (g.linkedLiabilityId) return 'linkedLiabilityId: only a debt payoff goal can link a loan'
  return null
}

/**
 * Why a target year is rejected, or null when it's fine. A year in the past is
 * allowed only when it's unchanged (`existingYear`) — editing an overdue goal's
 * name must not fail on its old year.
 */
export function targetYearError(year: number, currentYear: number, existingYear?: number): string | null {
  if (year === existingYear) return null
  if (year < currentYear || year > MAX_TARGET_YEAR) {
    return `targetYear: must be between ${currentYear} and ${MAX_TARGET_YEAR}`
  }
  return null
}

export const createGoalSchema = z.object({
  // Client-generated so the UI can keep editing a goal while its create is in
  // flight (no temp-id swap). A collision with an existing row is a 409.
  id: z.uuid().optional(),
  ...baseFields,
  kind: baseFields.kind.optional(),
  currentUsd: baseFields.currentUsd.default(0),
  linkedAccountIds: baseFields.linkedAccountIds.default([]),
  plannedMonthlyUsd: baseFields.plannedMonthlyUsd.optional(),
  linkedLiabilityId: baseFields.linkedLiabilityId.optional(),
  originalAmount: baseFields.originalAmount.optional(),
})

/** PATCH touches a subset; the route checks `targetYear` with `targetYearError`. */
export const updateGoalSchema = z.object(baseFields).partial()

/** A goal as stored before persistence (localStorage). Lenient on the year. */
const legacyGoalSchema = createGoalSchema.omit({ id: true })

export const importGoalsSchema = z.object({
  goals: z.array(z.unknown()).max(MAX_IMPORT),
})

export type CreateGoalInput = z.infer<typeof createGoalSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>

/** The Prisma `Goal` row fields this module reads. */
export interface GoalRecord {
  id: string
  name: string
  category: string
  kind: string | null
  targetUsd: number
  currentUsd: number
  targetYear: number
  linkedAccountIds: string[]
  plannedMonthlyUsd: number | null
  linkedLiabilityId: string | null
  originalAmount: number | null
}

const isCategory = (c: string): c is GoalCategory => (GOAL_CATEGORIES as readonly string[]).includes(c)
const isKind = (k: string | null): k is GoalKind => k !== null && (KINDS as readonly string[]).includes(k)

const unique = (ids: string[]) => Array.from(new Set(ids))

/** DB row -> client `Goal`. Optional fields are omitted rather than null. */
export function toGoal(row: GoalRecord): Goal {
  const goal: Goal = {
    id: row.id,
    name: row.name,
    category: isCategory(row.category) ? row.category : 'other',
    targetUsd: row.targetUsd,
    currentUsd: row.currentUsd,
    targetYear: row.targetYear,
  }
  if (isKind(row.kind)) goal.kind = row.kind
  if (row.linkedAccountIds.length > 0) goal.linkedAccountIds = row.linkedAccountIds
  if (row.plannedMonthlyUsd != null) goal.plannedMonthlyUsd = row.plannedMonthlyUsd
  if (row.linkedLiabilityId) goal.linkedLiabilityId = row.linkedLiabilityId
  if (row.originalAmount != null) goal.originalAmount = row.originalAmount
  return goal
}

export function toCreateData(input: CreateGoalInput, userId: string) {
  return {
    ...(input.id ? { id: input.id } : {}),
    userId,
    name: input.name,
    category: input.category,
    kind: input.kind ?? null,
    targetUsd: input.targetUsd,
    currentUsd: input.currentUsd,
    targetYear: input.targetYear,
    linkedAccountIds: unique(input.linkedAccountIds),
    plannedMonthlyUsd: input.plannedMonthlyUsd ?? null,
    linkedLiabilityId: input.linkedLiabilityId ?? null,
    originalAmount: input.originalAmount ?? null,
  }
}

export function toUpdateData(patch: UpdateGoalInput): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    data[key] = key === 'linkedAccountIds' ? unique(value as string[]) : value
  }
  return data
}

/** Identity of a goal for import dedupe: same name, category, target and year. */
function signature(g: Pick<Goal, 'name' | 'category' | 'targetUsd' | 'targetYear'>): string {
  return [g.name.trim().toLowerCase(), g.category, g.targetUsd, g.targetYear].join('|')
}

/**
 * Turn browser-stored goals into create inputs, idempotently:
 *  • invalid entries are skipped (old data must not block the import);
 *  • goals matching an existing (or earlier imported) one are skipped, so a
 *    retried import never duplicates;
 *  • links to accounts the user doesn't own, or that another goal already
 *    claims, are dropped (first claim wins).
 */
export function prepareImport(
  raw: unknown[],
  existing: Pick<GoalRecord, 'name' | 'category' | 'targetUsd' | 'targetYear' | 'linkedAccountIds'>[],
  ownedAccountIds: Set<string>,
): CreateGoalInput[] {
  const seen = new Set(existing.map((g) => signature({ ...g, category: g.category as GoalCategory })))
  const claimed = new Set(existing.flatMap((g) => g.linkedAccountIds))
  const out: CreateGoalInput[] = []
  for (const item of raw) {
    const parsed = legacyGoalSchema.safeParse(item)
    if (!parsed.success) continue
    const g = parsed.data
    const sig = signature(g)
    if (seen.has(sig)) continue
    seen.add(sig)
    const links = unique(g.linkedAccountIds).filter((id) => ownedAccountIds.has(id) && !claimed.has(id))
    for (const id of links) claimed.add(id)
    out.push({ ...g, linkedAccountIds: links })
  }
  return out
}

export { formatZodError } from '@/lib/accounts-api'
