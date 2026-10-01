/**
 * Balance history. One snapshot per account per day, where a "day" is the UTC
 * calendar date: a second write on the same UTC day overwrites that day's row
 * with the latest balance (atomic upsert on the (accountId, day) unique key), so
 * repeated edits or a cron that runs twice never create duplicates.
 */

import { prisma } from '@/lib/prisma'

/** The UTC calendar date `d` falls on, as a Date at 00:00:00Z. */
export function snapshotDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** True when an edit changes either stored balance (only then is history written). */
export function balanceChanged(
  before: { balanceUsd: number; balanceInr: number },
  data: { balanceUsd?: unknown; balanceInr?: unknown },
): boolean {
  return (
    (typeof data.balanceUsd === 'number' && data.balanceUsd !== before.balanceUsd) ||
    (typeof data.balanceInr === 'number' && data.balanceInr !== before.balanceInr)
  )
}

export async function writeDailySnapshot(
  accountId: string,
  balanceUsd: number,
  balanceInr: number,
  now: Date = new Date(),
): Promise<void> {
  const day = snapshotDay(now)
  await prisma.balanceSnapshot.upsert({
    where: { accountId_day: { accountId, day } },
    update: { balanceUsd, balanceInr, recordedAt: now },
    create: { accountId, day, balanceUsd, balanceInr, recordedAt: now },
  })
}
