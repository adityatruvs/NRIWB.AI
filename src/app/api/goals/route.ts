import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import {
  createGoalSchema,
  targetYearError,
  toCreateData,
  toGoal,
  formatZodError,
} from '@/lib/goals-api'
import { goalLinksError, releaseOps } from '@/lib/goals-db'

export const runtime = 'nodejs'

/** GET /api/goals — the authenticated user's goals, oldest first. */
export async function GET() {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  const rows = await prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
  return Response.json({ goals: rows.map(toGoal) })
}

/**
 * POST /api/goals — create one goal. Linked accounts must be the caller's; any
 * other goal funded by them loses the link (an account funds at most one goal).
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

  const parsed = createGoalSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }
  const input = parsed.data

  const yearError = targetYearError(input.targetYear, new Date().getUTCFullYear())
  if (yearError) return Response.json({ error: yearError }, { status: 400 })

  const linkError = await goalLinksError(
    userId,
    { category: input.category, linkedAccountIds: input.linkedAccountIds, linkedLiabilityId: input.linkedLiabilityId ?? null },
    true,
  )
  if (linkError) return Response.json({ error: linkError }, { status: 400 })

  const data = toCreateData(input, userId)
  try {
    const release = await releaseOps(userId, data.id ?? '', data.linkedAccountIds)
    const [created] = await prisma.$transaction([prisma.goal.create({ data }), ...release])
    return Response.json({ goal: toGoal(created) }, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return Response.json({ error: 'A goal with this id already exists' }, { status: 409 })
    }
    throw e
  }
}
