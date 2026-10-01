/** The /api/budget contract: validation + row mapping (server-side; pulls in zod). */

import { z } from 'zod'
import { STARTER_BUDGET, STARTER_CATEGORIES, type Budget } from '@/lib/budget'

export const MAX_CATEGORIES = 50

export const budgetSchema = z.object({
  incomeUsd: z.number().min(0, 'incomeUsd cannot be negative'),
  categories: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        label: z.string().trim().min(1, 'label is required').max(60, 'label must be 60 characters or fewer'),
        amount: z.number().min(0, 'amount cannot be negative'),
        color: z.string().min(1).max(64),
      }),
    )
    .max(MAX_CATEGORIES, `at most ${MAX_CATEGORIES} categories`),
})

/** A stored budget row -> `Budget`, falling back to the starter on bad data. */
export function toBudget(row: { incomeUsd: number; categories: unknown } | null): Budget {
  if (!row) return STARTER_BUDGET
  const parsed = budgetSchema.shape.categories.safeParse(row.categories)
  return { incomeUsd: row.incomeUsd, categories: parsed.success ? parsed.data : STARTER_CATEGORIES }
}
