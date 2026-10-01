'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { CreditCard, Globe2, X } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { formatLakhs } from '@/lib/currency'
import {
  debtRollup,
  currencyMismatch,
  mismatchStillDismissed,
  type CurrencyMismatch,
} from '@/lib/debt'
import type { Holding } from '@/lib/portfolio'
import { cn } from '@/lib/utils'

/* ── Dismissal (per user, in this browser) ─────────────────────────────────── */

const dismissKey = (userId: string) => `nriwb:dismiss:debt-currency:${userId}`

/**
 * Whether the currency-mismatch warning is dismissed. Dismissing records the INR
 * debt share at that moment; the warning comes back once the share moves 10+ points.
 */
export function useMismatchDismissal(sharePct: number) {
  const { user } = useUser()
  const userId = user?.id ?? null
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  useEffect(() => {
    if (!userId) return
    try {
      const v = localStorage.getItem(dismissKey(userId))
      setDismissedAt(v === null ? null : Number(v))
    } catch {
      /* ignore */
    }
  }, [userId])
  // Other components (Home item vs Accounts banner) share the state via the event.
  useEffect(() => {
    const onChange = (e: Event) => setDismissedAt((e as CustomEvent<number | null>).detail)
    window.addEventListener('nriwb:debt-currency-dismiss', onChange)
    return () => window.removeEventListener('nriwb:debt-currency-dismiss', onChange)
  }, [])
  const dismiss = useCallback(() => {
    if (!userId) return
    try {
      localStorage.setItem(dismissKey(userId), String(sharePct))
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent('nriwb:debt-currency-dismiss', { detail: sharePct }))
  }, [userId, sharePct])
  return { dismissed: mismatchStillDismissed(dismissedAt, sharePct), dismiss }
}

/** The educational message: states the exposure, never what to do about it. */
export function mismatchCopy(m: CurrencyMismatch) {
  return {
    title: 'Your debt and income are in different currencies',
    detail: `${Math.round(m.inrDebtSharePct)}% of your debt is in rupees; ${Math.round(100 - m.inrIncomeSharePct)}% of your income is in dollars. If the rupee strengthens 5%, your ${formatLakhs(m.inrDebtInr)} of India debt costs about $${Math.round(m.exposureUsd).toLocaleString('en-US')} more in dollars.`,
  }
}

export function CurrencyMismatchBanner({ m, onDismiss }: { m: CurrencyMismatch; onDismiss: () => void }) {
  const copy = mismatchCopy(m)
  return (
    <div className="relative rounded-xl border border-warning/25 bg-warning-muted/40 px-3.5 py-3 pr-9 text-[12.5px]">
      <p className="flex items-center gap-1.5 font-medium">
        <Globe2 size={13} className="shrink-0 text-warning" />
        {copy.title}
      </p>
      <p className="mt-1 leading-relaxed text-muted-foreground">{copy.detail}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss currency warning"
        className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X size={12} />
      </button>
    </div>
  )
}

/* ── Debt summary card ─────────────────────────────────────────────────────── */

/**
 * Total owed, balance-weighted average rate and monthly payments across both
 * countries. Renders nothing when there's no debt.
 */
export function DebtSummaryCard({
  holdings,
  rate,
  variant = 'accounts',
  className,
}: {
  holdings: Holding[]
  rate: number
  /** `home` is the compact widget; `accounts` adds the mismatch banner. */
  variant?: 'accounts' | 'home'
  className?: string
}) {
  const r = debtRollup(holdings, rate)
  const m = currencyMismatch(holdings, rate)
  const { dismissed, dismiss } = useMismatchDismissal(m.inrDebtSharePct)
  if (r.count === 0) return null

  const missing = r.missingApr.filter((h) => h.id)
  return (
    <Card id={variant === 'accounts' ? 'debt-summary' : undefined} className={cn('scroll-mt-24', className)}>
      <CardHeader
        title="Debt"
        subtitle={`${r.count} loan${r.count === 1 ? '' : 's'} across both countries`}
        icon={<CreditCard size={15} />}
        action={
          variant === 'home' ? (
            <Link href="/accounts?section=debt" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
              Details
            </Link>
          ) : undefined
        }
      />
      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-[11.5px] text-muted-foreground">Total owed</dt>
          <dd>
            <Money usd={r.totalUsd} className="tabular-nums text-[15px] font-semibold text-danger" />
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-muted-foreground">Avg. rate</dt>
          <dd className="tabular-nums text-[15px] font-semibold">
            {r.avgAprPct != null ? `${r.avgAprPct.toFixed(2)}%` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-muted-foreground">Payments / mo</dt>
          <dd>
            <Money usd={r.monthlyPaymentsUsd} className="tabular-nums text-[15px] font-semibold" />
          </dd>
        </div>
      </dl>
      {r.byCountry.US > 0 && r.byCountry.IN > 0 && (
        <p className="mt-2.5 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
          <span>
            🇺🇸 <Money usd={r.byCountry.US} className="tabular-nums font-medium text-foreground" />
          </span>
          <span>
            🇮🇳 <Money usd={r.byCountry.IN} className="tabular-nums font-medium text-foreground" />
          </span>
        </p>
      )}
      {missing.length > 0 && (
        <p className="mt-2.5 text-[12px] text-muted-foreground">
          <Link
            href={`/accounts?focus=${encodeURIComponent(missing[0].id!)}`}
            className="font-medium text-warning underline-offset-2 hover:underline"
          >
            {missing.length} loan{missing.length === 1 ? '' : 's'} missing a rate
          </Link>{' '}
          {missing.length === 1 ? 'is' : 'are'} left out of the average
          {missing.length > 1 && `: ${missing.map((h) => h.nickname).join(', ')}`}.
        </p>
      )}
      {variant === 'accounts' && m.fires && !dismissed && (
        <div className="mt-3">
          <CurrencyMismatchBanner m={m} onDismiss={dismiss} />
        </div>
      )}
    </Card>
  )
}
