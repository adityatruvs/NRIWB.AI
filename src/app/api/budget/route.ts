import { prisma } from '@/lib/prisma'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { budgetSchema, toBudget } from '@/lib/budget-api'
import { formatZodError } from '@/lib/accounts-api'

export const runtime = 'nodejs'

/**
 * GET /api/budget — the user's budget, or the $0 starter template when none is
 * saved yet. `saved` tells the client whether a row exists (drives the one-time
 * localStorage import).
 */
export async function GET() {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  const row = await prisma.budget.findUnique({ where: { userId } })
  return Response.json({ budget: toBudget(row), saved: row !== null })
}

/** PUT /api/budget — replace the whole budget (it's small; no per-category routes). */
export async function PUT(request: Request) {
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

  const parsed = budgetSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }
  const { incomeUsd, categories } = parsed.data

  const row = await prisma.budget.upsert({
    where: { userId },
    update: { incomeUsd, categories },
    create: { userId, incomeUsd, categories },
  })
  return Response.json({ budget: toBudget(row) })
}
