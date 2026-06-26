'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ListChecks,
  X,
  Landmark,
  ArrowRight,
  Link2,
} from 'lucide-react'
import { useAccounts } from '@/context/AccountsContext'
import { useGoals } from '@/context/GoalsContext'
import { useProfile } from '@/context/ProfileContext'
import { useCurrency } from '@/context/CurrencyContext'
import { usdValue, TYPE_LABELS } from '@/lib/portfolio'
import { Card } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { RadialProgress } from '@/components/ui/charts'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'nriwb:setup-collapsed'

interface ChecklistItem {
  key: string
  label: string
  hint: string
  done: boolean
  href: string
}

export function DataCompletion() {
  const { holdings } = useAccounts()
  const { goals } = useGoals()
  const { age } = useProfile()
  const { rate } = useCurrency()

  const [collapsed, setCollapsed] = useState(false)
  const [showAccounts, setShowAccounts] = useState(false)
  // Read the persisted collapse state after mount so SSR and the first client
  // render agree (localStorage is unavailable on the server).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const usCount = holdings.filter((h) => h.country === 'US').length
  const inCount = holdings.filter((h) => h.country === 'IN').length

  const items: ChecklistItem[] = [
    {
      key: 'profile',
      label: 'Complete your profile',
      hint: age !== null ? `Age ${age} on file` : 'Add your date of birth',
      done: age !== null,
      href: '/',
    },
    {
      key: 'us',
      label: 'Add a US account',
      hint: usCount > 0 ? `${usCount} connected` : 'Connect via Plaid, or add manually',
      done: usCount > 0,
      href: '/accounts',
    },
    {
      key: 'in',
      label: 'Add an India account',
      hint: inCount > 0 ? `${inCount} connected` : 'Add manually (auto-link coming soon)',
      done: inCount > 0,
      href: '/accounts',
    },
    {
      key: 'goal',
      label: 'Set a financial goal',
      hint: goals.length > 0 ? `${goals.length} active` : 'None yet',
      done: goals.length > 0,
      href: '/goals',
    },
  ]

  const doneCount = items.filter((i) => i.done).length
  const pct = Math.round((doneCount / items.length) * 100)
  const complete = doneCount === items.length

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      {/* Header — always visible, doubles as the collapse toggle */}
      <button
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/30"
      >
        <span className="icon-chip size-8 shrink-0">
          <ListChecks size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[15px] font-medium tracking-tight">
            {complete ? 'Your setup is complete' : 'Finish setting up'}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {complete
              ? 'Everything we need to tailor your cross-border picture'
              : `${doneCount} of ${items.length} done · the more you add, the sharper your insights`}
          </p>
        </div>
        {/* Slim progress pill (visible even when collapsed) */}
        <div className="hidden items-center gap-2 sm:flex">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular-nums text-xs font-semibold tabular-nums text-muted-foreground">
            {pct}%
          </span>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 text-muted-foreground transition-transform duration-200',
            collapsed && '-rotate-90',
          )}
        />
      </button>

      {/* Body — hidden when collapsed */}
      {!collapsed && (
        <div className="border-t border-border/60 px-5 py-5">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
            <RadialProgress
              value={doneCount / items.length}
              color={complete ? 'var(--success)' : 'var(--brand)'}
              size={96}
              thickness={9}
            >
              <div>
                <span className="tabular-nums text-lg font-bold tabular-nums">{pct}%</span>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">done</p>
              </div>
            </RadialProgress>

            <ul className="grid w-full flex-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="group -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40"
                  >
                    {item.done ? (
                      <CheckCircle2 size={16} className="shrink-0 text-success" />
                    ) : (
                      <Circle size={16} className="shrink-0 text-muted-foreground/50" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-[13px] font-medium',
                          item.done && 'text-muted-foreground line-through decoration-muted-foreground/40',
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.hint}
                      </span>
                    </span>
                    {!item.done && (
                      <ArrowRight
                        size={13}
                        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
            <button
              onClick={() => setShowAccounts(true)}
              className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium"
            >
              <Landmark size={14} />
              View connected accounts
              <span className="rounded-full bg-muted px-1.5 py-0.5 tabular-nums text-[10px] font-semibold tabular-nums">
                {holdings.length}
              </span>
            </button>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Link2 size={14} />
              Add another
            </Link>
          </div>
        </div>
      )}

      {showAccounts && (
        <ConnectedAccountsModal
          holdings={holdings}
          rate={rate}
          onClose={() => setShowAccounts(false)}
        />
      )}
    </Card>
  )
}

/* ── Popup: every connected account, grouped by country ───────────────────── */

const COUNTRY = {
  US: { flag: '🇺🇸', name: 'United States', color: 'var(--us)' },
  IN: { flag: '🇮🇳', name: 'India', color: 'var(--india)' },
} as const

function ConnectedAccountsModal({
  holdings,
  rate,
  onClose,
}: {
  holdings: ReturnType<typeof useAccounts>['holdings']
  rate: number
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups = (['US', 'IN'] as const)
    .map((c) => ({
      country: c,
      accounts: holdings
        .filter((h) => h.country === c)
        .sort((a, b) => usdValue(b, rate) - usdValue(a, rate)),
    }))
    .filter((g) => g.accounts.length > 0)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card-surface relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden p-0 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0" />
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div>
            <h2 className="font-serif text-base font-medium tracking-tight">Connected accounts</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {holdings.length} across both countries
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No accounts connected yet.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((g) => {
                const total = g.accounts.reduce((s, a) => s + usdValue(a, rate), 0)
                const { flag, name, color } = COUNTRY[g.country]
                return (
                  <div key={g.country}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-base">{flag}</span>
                      <h3 className="text-[13px] font-semibold">{name}</h3>
                      <span
                        className="rounded-full px-2 py-0.5 tabular-nums text-[10px] font-bold tabular-nums"
                        style={{ background: `color-mix(in oklch, ${color} 13%, transparent)`, color }}
                      >
                        {g.accounts.length}
                      </span>
                      <Money
                        usd={total}
                        className="ml-auto tabular-nums text-[13px] font-semibold tabular-nums"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      {g.accounts.map((a) => (
                        <div
                          key={a.id ?? a.nickname}
                          className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-[14px] font-medium">{a.nickname}</p>
                              {a.isPfic && (
                                <span className="shrink-0 rounded bg-warning/12 px-1 py-px text-[9px] font-bold uppercase text-warning">
                                  PFIC
                                </span>
                              )}
                              {a.source !== 'manual' && (
                                <span className="shrink-0 rounded bg-accent px-1 py-px text-[9px] font-medium uppercase tracking-wide text-accent-foreground/80">
                                  {a.source}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                              {a.institution} · {TYPE_LABELS[a.accountType] ?? a.accountType}
                            </p>
                          </div>
                          <Money
                            usd={usdValue(a, rate)}
                            className="ml-3 shrink-0 tabular-nums text-[14px] font-semibold tabular-nums"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border/60 px-6 py-3.5">
          <Link
            href="/accounts"
            onClick={onClose}
            className="btn-primary flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-medium"
          >
            Manage accounts
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}
