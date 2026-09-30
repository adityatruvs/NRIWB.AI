/**
 * Everything the AI features know about a user, loaded from the database — never
 * from the request body — so the model can't be grounded on stale or fabricated
 * client data. One parallel batch keeps the added latency to a single round-trip.
 */

import { clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { toHolding } from '@/lib/accounts-api'
import { toGoal } from '@/lib/goals-api'
import { toBudget } from '@/lib/budget-api'
import { STARTER_BUDGET, monthlyContribution, type Budget } from '@/lib/budget'
import { ageFromDob } from '@/lib/profile'
import { DEMO_HOLDINGS, DEMO_GOALS } from '@/lib/demo'
import type { Holding } from '@/lib/portfolio'
import type { Goal } from '@/lib/goals'
import type { FbarSnapshot } from '@/lib/fbar'

export interface UserContext {
  holdings: Holding[]
  goals: Goal[]
  budget: Budget
  /** Sum of the budget's investing lines, per month (USD). */
  monthlyContribution: number
  age: number | null
  indiaDaysCurrentYear: number | null
  /** This calendar year's balance snapshots for India accounts (FBAR's recorded maxima). */
  fbarSnapshots: FbarSnapshot[]
  /** True when this is the demo seed rather than the user's real data. */
  demo: boolean
}

/** Fallback USD/INR until the live FX service (F-02) provides a server rate. */
export const DEFAULT_USD_INR = 83

/**
 * The client-sent rate, kept only until the FX service lands. Anything outside a
 * sane band (or missing) falls back to the default, so a crafted rate can't skew
 * the numbers the model sees.
 */
export function parseRate(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 50 && n <= 150 ? n : DEFAULT_USD_INR
}

async function loadProfile(userId: string) {
  try {
    const user = await (await clerkClient()).users.getUser(userId)
    const meta = (user.privateMetadata ?? {}) as { dateOfBirth?: string }
    return { age: ageFromDob(meta.dateOfBirth) }
  } catch (e) {
    console.warn('[user-context] profile lookup failed:', (e as Error).message)
    return { age: null }
  }
}

export async function loadUserContext(userId: string, opts: { demo?: boolean } = {}): Promise<UserContext> {
  if (opts.demo) {
    // Demo reads nothing from the user's real financial data.
    const { age } = await loadProfile(userId)
    return {
      holdings: DEMO_HOLDINGS,
      goals: DEMO_GOALS,
      budget: STARTER_BUDGET,
      monthlyContribution: 0,
      age,
      indiaDaysCurrentYear: null,
      fbarSnapshots: [],
      demo: true,
    }
  }

  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))
  const [accounts, goals, budgetRow, compliance, profile, snapshots] = await Promise.all([
    prisma.account.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.budget.findUnique({ where: { userId } }),
    prisma.complianceData.findUnique({ where: { userId } }),
    loadProfile(userId),
    prisma.balanceSnapshot.findMany({
      where: { account: { userId, country: 'IN' }, recordedAt: { gte: yearStart } },
      select: { accountId: true, day: true, recordedAt: true, balanceInr: true },
    }),
  ])
  const budget = toBudget(budgetRow)
  return {
    holdings: accounts.map(toHolding),
    goals: goals.map(toGoal),
    budget,
    monthlyContribution: monthlyContribution(budget.categories),
    age: profile.age,
    indiaDaysCurrentYear: compliance?.indiaDaysCurrentYear ?? null,
    fbarSnapshots: snapshots.map((s) => ({
      accountId: s.accountId,
      day: (s.day ?? s.recordedAt).toISOString().slice(0, 10),
      balanceInr: s.balanceInr,
    })),
    demo: false,
  }
}
