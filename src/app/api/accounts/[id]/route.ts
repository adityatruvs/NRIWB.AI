import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/prisma'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import {
  updateAccountSchema,
  toUpdateData,
  toHolding,
  formatZodError,
} from '@/lib/accounts-api'

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

/**
 * GET /api/accounts/[id] — a single account owned by the user, or 404.
 * (Convenience; the ledger is normally read via the collection GET.)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOr401()
  if (auth instanceof Response) return auth
  const userId = auth
  const { id } = await params

  const row = await prisma.account.findFirst({ where: { id, userId } })
  if (!row) return Response.json({ error: 'Account not found' }, { status: 404 })
  return Response.json({ account: toHolding(row) })
}

/**
 * PATCH /api/accounts/[id] — update a subset of one account's fields.
 * Scoped to the user; validates a secured-against link points at the user's own
 * (different) account.
 */
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

  const parsed = updateAccountSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Confirm the row exists AND belongs to this user before touching it.
  const existing = await prisma.account.findFirst({ where: { id, userId }, select: { id: true } })
  if (!existing) return Response.json({ error: 'Account not found' }, { status: 404 })

  // A non-null secured-against link must reference a *different* account of the user's.
  if (parsed.data.securedAgainstId) {
    if (parsed.data.securedAgainstId === id) {
      return Response.json({ error: 'An account cannot be secured against itself' }, { status: 400 })
    }
    const asset = await prisma.account.findFirst({
      where: { id: parsed.data.securedAgainstId, userId },
      select: { id: true },
    })
    if (!asset) {
      return Response.json(
        { error: 'securedAgainstId does not reference one of your accounts' },
        { status: 400 },
      )
    }
  }

  const data = toUpdateData(parsed.data)
  // Translate the mapper's "clear it" sentinel into Prisma's JSON-null.
  if (data.details === null) data.details = Prisma.DbNull

  try {
    const updated = await prisma.account.update({
      where: { id },
      data: data as Prisma.AccountUncheckedUpdateInput,
    })
    return Response.json({ account: toHolding(updated) })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return Response.json({ error: 'This account is already linked' }, { status: 409 })
    }
    throw e
  }
}

/**
 * DELETE /api/accounts/[id] — remove one account.
 * Any liability secured against it is unlinked first (in the same transaction), so
 * no dangling `securedAgainstId` is left behind. BalanceSnapshots cascade.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOr401()
  if (auth instanceof Response) return auth
  const userId = auth
  const { id } = await params

  const existing = await prisma.account.findFirst({ where: { id, userId }, select: { id: true } })
  if (!existing) return Response.json({ error: 'Account not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.account.updateMany({
      where: { userId, securedAgainstId: id },
      data: { securedAgainstId: null },
    }),
    prisma.account.delete({ where: { id } }),
  ])

  return Response.json({ success: true, id })
}
