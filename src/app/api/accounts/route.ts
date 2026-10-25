import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import {
  createAccountSchema,
  toCreateData,
  toHolding,
  formatZodError,
} from '@/lib/accounts-api'
import { writeDailySnapshot } from '@/lib/snapshots'

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

  const [rows, reauthItems] = await Promise.all([
    prisma.account.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.plaidItem.findMany({
      where: { userId, status: 'requires_reauth' },
      select: { itemId: true },
    }),
  ])
  // Rows on an item whose bank login expired get a "Reconnect" badge.
  const reauth = new Set(reauthItems.map((i) => i.itemId))
  const accounts = rows.map((r) => {
    const h = toHolding(r)
    return r.plaidItemId && reauth.has(r.plaidItemId) ? { ...h, needsReauth: true, plaidItemId: r.plaidItemId } : h
  })
  return Response.json({ accounts })
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

  // A repeat of a save we already did (a retry after a lost reply): hand back what exists.
  if (input.clientId) {
    const existing = await prisma.account.findUnique({ where: { id: input.clientId } })
    if (existing) {
      if (existing.userId !== userId) return Response.json({ error: 'That id is already taken' }, { status: 409 })
      return Response.json({ account: toHolding(existing) }, { status: 200 })
    }
  }

  try {
    const created = await prisma.account.create({
      data: toCreateData(input, userId) as Prisma.AccountUncheckedCreateInput,
    })
    // History starts the day an account is added.
    await writeDailySnapshot(created.id, created.balanceUsd, created.balanceInr)
    return Response.json({ account: toHolding(created) }, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // Two copies of the same save arrived together and the other one won: return its row.
      if (input.clientId) {
        const winner = await prisma.account.findUnique({ where: { id: input.clientId } })
        if (winner && winner.userId === userId) return Response.json({ account: toHolding(winner) }, { status: 200 })
      }
      // Duplicate Plaid account id.
      return Response.json({ error: 'This account is already linked' }, { status: 409 })
    }
    throw e
  }
}
