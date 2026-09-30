/**
 * The demo seed, shared by the client (demo mode) and the server (demo-mode
 * Copilot and insights). Never written to a user's real data.
 */

import { MOCK_ACCOUNTS } from '@/data/mock/accounts'
import type { Holding } from '@/lib/portfolio'

export { SEED_GOALS as DEMO_GOALS } from '@/lib/goals'

// Sample ages (days since last update) so the demo shows a realistic freshness
// mix on Home and Accounts instead of every row reading "unknown".
const DEMO_AGES = [1, 3, 12, 40, 2, 95, 20, 150, 6, 33]
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

// Deterministic ids keep the demo overlay stable across renders.
export const DEMO_HOLDINGS: Holding[] = MOCK_ACCOUNTS.map((a, i) => ({
  id: `seed-${i}`,
  nickname: a.nickname,
  institution: a.institution,
  accountType: a.accountType,
  country: a.country,
  balanceUsd: a.balanceUsd,
  balanceInr: a.balanceInr,
  isPfic: a.isPfic,
  source: a.source,
  details: a.details,
  lastSyncedAt: daysAgo(DEMO_AGES[i % DEMO_AGES.length]),
}))
