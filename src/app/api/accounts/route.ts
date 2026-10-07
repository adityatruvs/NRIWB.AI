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

  try {
    const created = await prisma.account.create({
      data: toCreateData(input, userId) as Prisma.AccountUncheckedCreateInput,
    })
    // History starts the day an account is added.
    await writeDailySnapshot(created.id, created.balanceUsd, created.balanceInr)
    return Response.json({ account: toHolding(created) }, { status: 201 })
  } catch (e) {
    // Duplicate Plaid account id, or an imported holding with the same import key.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const error = input.details?.assetType
        ? 'You already have this holding — re-upload the statement to update it instead.'
        : 'This account is already linked'
      return Response.json({ error }, { status: 409 })
    }
    throw e
  }
}
