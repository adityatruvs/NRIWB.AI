'use client'

import { useCurrency } from '@/context/CurrencyContext'
import { formatAmount } from '@/lib/currency'
import { GOAL_STATUS_LABELS, type GoalStatus, type GoalStatusKind } from '@/lib/goal-status'
import { cn } from '@/lib/utils'

const TONE: Record<GoalStatusKind, string> = {
  reached: 'bg-success-muted/80 text-success ring-success/20',
  ahead: 'bg-success-muted/80 text-success ring-success/20',
  on_track: 'bg-brand/10 text-brand ring-brand/20',
  behind: 'bg-warning-muted/80 text-warning ring-warning/20',
  overdue: 'bg-danger-muted/80 text-danger ring-danger/20',
  needs_details: 'bg-muted text-muted-foreground ring-border',
  loan_removed: 'bg-muted text-muted-foreground ring-border',
}

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Tooltip copy for a debt-payoff goal. */
function debtPace(status: GoalStatus, targetYear: number): string {
  switch (status.status) {
    case 'reached':
      return 'This loan is paid off.'
    case 'needs_details':
      return "Add the loan's interest rate and minimum payment to see when it's paid off."
    case 'loan_removed':
      return 'The linked loan was deleted. Relink a loan or delete this goal.'
    default:
      return status.payoffMonth
        ? `At the minimum payment, this loan is paid off around ${monthLabel(status.payoffMonth)} (target: ${targetYear}).`
        : "At the minimum payment, this loan doesn't pay off: the payment doesn't cover the interest."
  }
}

/**
 * On track / Ahead / Behind for one goal, with the monthly gap when behind.
 * Educational wording: it describes the pace, never tells the user what to do.
 */
export function GoalStatusChip({
  status,
  targetYear,
  compact = false,
}: {
  status: GoalStatus
  targetYear: number
  /** Home widget: just the chip, gap folded into the tooltip. */
  compact?: boolean
}) {
  const { mode, rate } = useCurrency()
  const money = (n: number) => formatAmount(n, mode, rate)
  const pace =
    status.payoffMonth !== undefined || status.status === 'needs_details' || status.status === 'loan_removed'
      ? debtPace(status, targetYear)
      : status.status === 'reached'
      ? 'Funded at or above target.'
      : status.status === 'overdue'
        ? `Target year ${targetYear} has passed.`
        : `At this pace you'd reach ~${money(status.projectedUsd)} by ${targetYear}${
            status.hasPlan ? '' : ' (from savings alone; no monthly amount set)'
          }.`
  const gap =
    status.monthlyGapUsd != null && status.monthlyGapUsd >= 1 ? `needs ~${money(status.monthlyGapUsd)}/mo more` : null

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5" title={pace}>
      <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', TONE[status.status])}>
        {GOAL_STATUS_LABELS[status.status]}
      </span>
      {!compact && gap && <span className="text-[11.5px] text-muted-foreground">{gap}</span>}
      {!compact && !gap && !status.hasPlan && (status.status === 'behind' || status.status === 'on_track') && (
        <span className="text-[11.5px] text-muted-foreground">add a monthly amount for a truer read</span>
      )}
    </span>
  )
}
