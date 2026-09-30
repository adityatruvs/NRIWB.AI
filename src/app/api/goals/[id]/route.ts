import { prisma } from '@/lib/prisma'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import {
  updateGoalSchema,
  targetYearError,
  toUpdateData,
  toGoal,
  formatZodError,
} from '@/lib/goals-api'
import { goalLinksError, releaseOps } from '@/lib/goals-db'

export const runtime = 'nodejs'

/** Resolve the authenticated user, or return a 401 Response to send back. */
async function authOr401(): Promise<string | Response> {
  try {
    return await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }
}

const notFound = () => Response.json({ error: 'Goal not found' }, { status: 404 })

/** GET /api/goals/[id] — one of the user's goals, or 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOr401()
  if (auth instanceof Response) return auth
  const { id } = await params

  const row = await prisma.goal.findFirst({ where: { id, userId: auth } })
  if (!row) return notFound()
  return Response.json({ goal: toGoal(row) })
}

/** PATCH /api/goals/[id] — update a subset of one goal's fields. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOr401()
  if (auth instanceof Response) return auth
  const userId = auth
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = updateGoalSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Confirm the row exists AND belongs to this user before touching it.
  const existing = await prisma.goal.findFirst({
    where: { id, userId },
    select: { id: true, targetYear: true, category: true, linkedAccountIds: true, linkedLiabilityId: true },
  })
  if (!existing) return notFound()

  if (parsed.data.targetYear !== undefined) {
    const yearError = targetYearError(
      parsed.data.targetYear,
      new Date().getUTCFullYear(),
      existing.targetYear,
    )
    if (yearError) return Response.json({ error: yearError }, { status: 400 })
  }

  const data = toUpdateData(parsed.data)
  const claimed = (data.linkedAccountIds as string[] | undefined) ?? []
  // Validate links against the goal as it will be after this patch.
  const linkError = await goalLinksError(
    userId,
    {
      category: parsed.data.category ?? existing.category,
      linkedAccountIds: parsed.data.linkedAccountIds ?? existing.linkedAccountIds,
      linkedLiabilityId:
        parsed.data.linkedLiabilityId !== undefined ? parsed.data.linkedLiabilityId : existing.linkedLiabilityId,
    },
    false,
    existing.linkedAccountIds,
  )
  if (linkError) return Response.json({ error: linkError }, { status: 400 })

  const release = await releaseOps(userId, id, claimed)
  const [updated] = await prisma.$transaction([
    prisma.goal.update({ where: { id }, data }),
    ...release,
  ])
  return Response.json({ goal: toGoal(updated) })
}

/** DELETE /api/goals/[id] — remove one goal. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOr401()
  if (auth instanceof Response) return auth
  const { id } = await params

  const { count } = await prisma.goal.deleteMany({ where: { id, userId: auth } })
  if (count === 0) return notFound()
  return Response.json({ success: true, id })
}
