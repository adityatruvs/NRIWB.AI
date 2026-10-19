import { prisma } from '@/lib/prisma'
import { isGoalFundingAccount, type Holding } from '@/lib/portfolio'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { importGoalsSchema, prepareImport, toCreateData, toGoal, formatZodError } from '@/lib/goals-api'

export const runtime = 'nodejs'

/**
 * POST /api/goals/import — one-time move of goals that were stored in the
 * browser before goals were persisted. Idempotent: goals already on the server
 * are skipped, so a retried import never duplicates. Returns the full list.
 */
export async function POST(request: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = importGoalsSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }

  const [existing, accounts] = await Promise.all([
    prisma.goal.findMany({ where: { userId } }),
    prisma.account.findMany({ where: { userId }, select: { id: true, kind: true, accountType: true } }),
  ])
  // Only accounts that can fund a goal may be linked (no loans, property or vehicles).
  const fundable = accounts.filter((a) => isGoalFundingAccount(a as Pick<Holding, 'kind' | 'accountType'>))
  const inputs = prepareImport(parsed.data.goals, existing, new Set(fundable.map((a) => a.id)))

  const created = inputs.length
    ? await prisma.$transaction(inputs.map((g) => prisma.goal.create({ data: toCreateData(g, userId) })))
    : []

  return Response.json({ goals: [...existing, ...created].map(toGoal), imported: created.length })
}
