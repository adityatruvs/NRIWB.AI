import { prisma } from '@/lib/prisma'
import { releaseClaims, linkRuleError } from '@/lib/goals-api'

/**
 * Why a goal's links are invalid, or null. Funding accounts must all be the
 * user's own *assets* (a loan never reduces a savings goal); a debt-payoff goal
 * must link one of the user's own *liabilities*. `isNew`: a debt goal being
 * created must have a loan (an existing one may have lost it to a deletion).
 * `alreadyLinked`: ids the goal linked before this write — kept even if one is a
 * loan (the old UI allowed that), so editing such a goal doesn't start failing.
 */
export async function goalLinksError(
  userId: string,
  g: { category: string; linkedAccountIds: string[]; linkedLiabilityId: string | null },
  isNew: boolean,
  alreadyLinked: string[] = [],
): Promise<string | null> {
  const rule = linkRuleError(g)
  if (rule) return rule

  const kept = new Set(alreadyLinked)
  const ids = Array.from(new Set(g.linkedAccountIds)).filter((i) => !kept.has(i))
  if (ids.length > 0) {
    const assets = await prisma.account.count({ where: { userId, id: { in: ids }, kind: 'asset' } })
    if (assets !== ids.length) return 'linkedAccountIds must all reference your own asset accounts'
  }
  if (g.category === 'debt') {
    if (!g.linkedLiabilityId) return isNew ? 'linkedLiabilityId: a debt payoff goal needs a loan' : null
    const loan = await prisma.account.findFirst({
      where: { userId, id: g.linkedLiabilityId, kind: 'liability' },
      select: { id: true },
    })
    if (!loan) return 'linkedLiabilityId must reference one of your own loans'
  }
  return null
}

/**
 * Update ops that strip `claimed` account ids from the user's other goals, so an
 * account funds at most one goal. Run them in the same transaction as the write
 * that claims the accounts.
 */
export async function releaseOps(userId: string, keepId: string, claimed: string[]) {
  if (claimed.length === 0) return []
  const others = await prisma.goal.findMany({
    where: { userId, id: { not: keepId }, linkedAccountIds: { hasSome: claimed } },
    select: { id: true, linkedAccountIds: true },
  })
  return releaseClaims(others, keepId, claimed).map((g) =>
    prisma.goal.update({ where: { id: g.id }, data: { linkedAccountIds: g.linkedAccountIds } }),
  )
}
