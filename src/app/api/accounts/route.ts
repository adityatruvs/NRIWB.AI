import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import {
  createAccountSchema,
  toCreateData,
  toHolding,
  formatZodError,
} from '@/lib/accounts-api'

// Touches customer banking data + the DB — must run on Node, never the edge.
export const runtime = 'nodejs'

/**
 * GET /api/accounts — the authenticated user's full ledger as `Holding[]`.
 * Scoped to `userId`; a user can never read another user's rows.
 */
export async function GET() {
  let userId: string
  try {
    userId = await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  const rows = await prisma.account.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  return Response.json({ accounts: rows.map(toHolding) })
}

/**
 * POST /api/accounts — create one account for the authenticated user.
 * Body is a partial `Holding` (see `createAccountSchema`). Returns the created
 * account as a `Holding`, 201.
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

  const parsed = createAccountSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }
  const input = parsed.data

  // A secured-against link must point at one of *this user's* accounts — never a
  // guessed id belonging to someone else.
  if (input.securedAgainstId) {
    const asset = await prisma.account.findFirst({
      where: { id: input.securedAgainstId, userId },
      select: { id: true },
    })
    if (!asset) {
      return Response.json(
        { error: 'securedAgainstId does not reference one of your accounts' },
        { status: 400 },
      )
    }
  }

  try {
    const created = await prisma.account.create({
      data: toCreateData(input, userId) as Prisma.AccountUncheckedCreateInput,
    })
    return Response.json({ account: toHolding(created) }, { status: 201 })
  } catch (e) {
    // Duplicate Plaid account id (the only unique constraint on Account).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return Response.json({ error: 'This account is already linked' }, { status: 409 })
    }
    throw e
  }
}
