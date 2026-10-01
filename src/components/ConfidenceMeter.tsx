'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
  CONFIDENCE_BUCKETS,
  sharesToPercents,
  type ConfidenceBucket,
  type FreshnessMix,
} from '@/lib/freshness'
import { cn } from '@/lib/utils'

const META: Record<ConfidenceBucket, { label: string; color: string; hint: string }> = {
  fresh: { label: 'Fresh', color: 'var(--success)', hint: 'updated in the last 30 days' },
  aging: { label: 'Aging', color: 'var(--warning)', hint: '30–90 days old' },
  stale: { label: 'Stale', color: 'var(--danger)', hint: 'over 90 days old, or never confirmed' },
  estimated: { label: 'Estimated', color: 'var(--muted-foreground)', hint: 'a guessed value (home, gold, …)' },
}

/**
 * How much of net worth rests on current numbers: one stacked bar, weighted by
 * each account's size. Clicking it opens Accounts with the stalest rows first.
 */
export function ConfidenceMeter({ mix, className }: { mix: FreshnessMix; className?: string }) {
  const pct = sharesToPercents(mix.shares)
  const shown = CONFIDENCE_BUCKETS.filter((b) => pct[b] > 0)
  if (shown.length === 0) return null
  return (
    <Link
      href="/accounts?sort=stale"
      aria-label={`Data confidence: ${shown.map((b) => `${pct[b]}% ${META[b].label}`).join(', ')}. Open accounts, stalest first.`}
      className={cn(
        'group flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/40',
        className,
      )}
    >
      <span className="text-[12px] font-medium text-muted-foreground">Data confidence</span>
      <span className="flex h-1.5 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
        {shown.map((b) => (
          <span key={b} style={{ width: `${pct[b]}%`, background: META[b].color }} title={`${META[b].label}: ${META[b].hint}`} />
        ))}
      </span>
      <span className="flex flex-wrap gap-x-2.5 text-[11.5px] text-muted-foreground">
        {shown.map((b) => (
          <span key={b} className="inline-flex items-center gap-1" title={META[b].hint}>
            <span className="size-1.5 rounded-full" style={{ background: META[b].color }} />
            <span className="tabular-nums font-medium text-foreground">{pct[b]}%</span> {META[b].label.toLowerCase()}
          </span>
        ))}
      </span>
      <ArrowRight size={12} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
