'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Select } from '@base-ui/react/select'
import {
  Wallet,
  Search,
  Lightbulb,
  X,
  Link2,
  Plus,
  Inbox,
  FileText,
  Pencil,
  Trash2,
  AlertTriangle,
  CreditCard,
  Coins,
  Check,
  ChevronDown,
} from 'lucide-react'
import { AccountsLogo } from '@/components/ui/logos'
import { useCurrency } from '@/context/CurrencyContext'
import { useAccounts } from '@/context/AccountsContext'
import { useGoals } from '@/context/GoalsContext'
import { formatUSD, formatINR } from '@/lib/currency'
import {
  netWorth,
  byAssetClass,
  usdValue,
  isLiability,
  isSecurableAsset,
  LIABILITY_TYPES,
  SECURABLE_ASSET_TYPES,
  loansSecuredBy,
  assetEquity,
  pficHoldings,
  TYPE_LABELS,
  type Holding,
  type HoldingDetails,
} from '@/lib/portfolio'
import { typeExpectedReturn } from '@/lib/allocation'
import type { AccountType } from '@/types/accounts'
import { Card, CardHeader } from '@/components/ui/Card'
import { Donut } from '@/components/ui/charts'
import { Money } from '@/components/ui/Money'
import { Reveal } from '@/components/ui/Reveal'
import { PlaidConnect } from '@/components/PlaidConnect'
import { AddAccountChooser } from '@/components/AddAccountChooser'
import { cn } from '@/lib/utils'

type CountryFilter = 'all' | 'US' | 'IN'

const COUNTRY_META = {
  US: { flag: '🇺🇸', name: 'United States', color: 'var(--us)' },
  IN: { flag: '🇮🇳', name: 'India', color: 'var(--india)' },
} as const

export default function AccountsPage() {
  const { rate } = useCurrency()
  const { holdings, addLinked, addManual, updateAccount, removeAccount } = useAccounts()
  const { goals } = useGoals()

  // accountId → name of the goal it funds, so each account shows where it's earmarked.
  const accountToGoal = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of goals) for (const id of g.linkedAccountIds ?? []) m.set(id, g.name)
    return m
  }, [goals])
  const [adding, setAdding] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [editing, setEditing] = useState<Holding | null>(null)
  const [deleting, setDeleting] = useState<Holding | null>(null)
  const [filter, setFilter] = useState<CountryFilter>('all')
  const [query, setQuery] = useState('')
  const [jurHover, setJurHover] = useState<number | null>(null) // 0 = US, 1 = India

  const nw = netWorth(holdings, rate)
  const usCount = holdings.filter((h) => h.country === 'US').length
  const inCount = holdings.filter((h) => h.country === 'IN').length
  const pfics = pficHoldings(holdings)

  // NRE/NRO optimizer
  const nro = holdings.filter((h) => h.country === 'IN' && h.accountType === 'nro')
  const nroInr = nro.reduce((s, h) => s + h.balanceInr, 0)
  const tdsSavingInr = Math.round(nroInr * 0.06 * 0.3) // ~6% interest taxed at 30% TDS

  // Filter + search
  const q = query.trim().toLowerCase()
  const visible = holdings.filter(
    (h) =>
      (filter === 'all' || h.country === filter) &&
      (q === '' ||
        h.nickname.toLowerCase().includes(q) ||
        h.institution.toLowerCase().includes(q) ||
        (TYPE_LABELS[h.accountType] ?? '').toLowerCase().includes(q)),
  )
  const groups = (['US', 'IN'] as const)
    .map((c) => ({ country: c, accounts: visible.filter((h) => h.country === c) }))
    .filter((g) => g.accounts.length > 0)

  const showInsights = (filter === 'all' || filter === 'IN') && (nro.length > 0 || pfics.length > 0)

  const tabs: { key: CountryFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: holdings.length },
    { key: 'US', label: '🇺🇸 US', count: usCount },
    { key: 'IN', label: '🇮🇳 India', count: inCount },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-[0_2px_8px_-3px_hsl(var(--shadow-color)/0.4)]">
            <AccountsLogo size={18} />
          </span>
          <div>
            <h1 className="font-serif text-[1.7rem] font-medium tracking-tight">Accounts</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Everything you own, across both countries
            </p>
          </div>
        </div>
        <button
          onClick={() => setChoosing(true)}
          className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium"
        >
          <Plus size={14} />
          Add account
        </button>
      </div>

      {/* ── Summary strip — three quiet figures + the split, one card ──── */}
      <Reveal delay={0.04}>
        <Card className="grid divide-y divide-border/60 p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:p-0">
          <div className="flex items-center justify-between gap-4 px-6 py-5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-muted-foreground">{nw.liabilitiesUsd > 0 ? 'Net worth' : 'Total balance'}</p>
              <Money usd={nw.totalUsd} className="mt-1.5 block tabular-nums text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums" />
              <p className="mt-2 text-[13px] text-muted-foreground">
                {holdings.length} accounts
                {nw.liabilitiesUsd > 0 && (
                  <> · {formatUSD(nw.assetsUsd)} assets − {formatUSD(nw.liabilitiesUsd)} debt</>
                )}
              </p>
            </div>
            <Donut
              size={72}
              thickness={9}
              segments={[
                { value: nw.usUsd, color: 'var(--us)' },
                { value: nw.inUsd, color: 'var(--india)' },
              ]}
              activeIndex={jurHover}
              onHover={setJurHover}
            >
              {jurHover !== null ? (
                <span
                  key={jurHover}
                  className="animate-fade-in tabular-nums text-[12px] font-bold tabular-nums"
                  style={{ color: jurHover === 0 ? 'var(--us)' : 'var(--india)' }}
                >
                  {jurHover === 0 ? nw.usPct : nw.inPct}%
                </span>
              ) : (
                <span key="split" className="animate-fade-in tabular-nums text-[11px] font-bold tabular-nums text-muted-foreground">
                  {nw.usPct}/{nw.inPct}
                </span>
              )}
            </Donut>
          </div>
          <SummaryCell
            label="🇺🇸 United States"
            usd={nw.usUsd}
            sub={`${usCount} accounts · ${nw.usPct}%`}
            color="var(--us)"
            pct={nw.usPct}
            active={jurHover === 0}
            onEnter={() => setJurHover(0)}
            onLeave={() => setJurHover(null)}
          />
          <SummaryCell
            label="🇮🇳 India"
            usd={nw.inUsd}
            sub={`${inCount} accounts · ${nw.inPct}%`}
            color="var(--india)"
            pct={nw.inPct}
            active={jurHover === 1}
            onEnter={() => setJurHover(1)}
            onLeave={() => setJurHover(null)}
          />
        </Card>
      </Reveal>

      {/* ── Toolbar: tabs + search ────────────────────────────────────── */}
      <Reveal delay={0.08} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-0.5 rounded-xl border border-border/70 bg-muted/60 p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-all duration-150',
                filter === t.key
                  ? 'bg-card text-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] ring-1 ring-border/70'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-px tabular-nums text-[10px] font-semibold tabular-nums',
                  filter === t.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts…"
            className="h-9 w-56 rounded-xl border border-input bg-card pl-8.5 pr-3 text-[13px] shadow-[0_1px_2px_hsl(var(--shadow-color)/0.04)] outline-none transition-all placeholder:text-muted-foreground/60 focus:border-brand/60 focus:ring-[3px] focus:ring-brand/12 sm:w-64"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </Reveal>

      {/* ── Ledger + side rail ────────────────────────────────────────── */}
      <Reveal delay={0.12} className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        {/* Ledger */}
        <div className="flex min-w-0 flex-col gap-6">
          {groups.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 py-14 text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Inbox size={20} />
              </span>
              <p className="mt-1 text-sm font-medium">No accounts match “{query}”</p>
              <p className="text-[13px] text-muted-foreground">Try a different name, bank, or account type.</p>
            </Card>
          ) : (
            groups.map((g) => (
              <AccountGroup
                key={g.country}
                country={g.country}
                accounts={g.accounts}
                rate={rate}
                grandTotalUsd={nw.totalUsd}
                accountToGoal={accountToGoal}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            ))
          )}
        </div>

        {/* Side rail — insights & intake, nothing else */}
        <div className="flex flex-col gap-6">
          {showInsights && (
            <Card>
              <CardHeader title="Insights" subtitle="Ways to save & stay compliant" icon={<Lightbulb size={15} />} />
              <div className="flex flex-col gap-4">
                {nro.length > 0 && (
                  <InsightItem
                    icon={<Lightbulb size={14} />}
                    tone="warning"
                    title="Move NRO savings to NRE"
                  >
                    <span className="font-medium text-foreground">{formatINR(nroInr)}</span> in NRO earns interest
                    taxed at ~30% TDS. NRE interest is tax-free and repatriable — about{' '}
                    <span className="font-semibold text-success">{formatINR(tdsSavingInr)}/yr</span>{' '}
                    ({formatUSD(tdsSavingInr / rate)}) saved.
                  </InsightItem>
                )}
                {pfics.length > 0 && (
                  <InsightItem
                    icon={<FileText size={14} />}
                    tone="danger"
                    title={`${pfics.length} PFIC filing${pfics.length > 1 ? 's' : ''} due`}
                  >
                    India mutual funds are PFICs under US tax law — each needs{' '}
                    <span className="font-medium text-foreground">Form 8621</span>. Ask Copilot about QEF vs
                    mark-to-market.
                  </InsightItem>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Add more" subtitle="Link, upload, or type it in" icon={<Link2 size={15} />} />
            <div className="flex flex-col gap-2">
              <PlaidConnect fxRate={rate} onLinked={addLinked} />
              <button
                disabled
                title="India bank linking is coming soon"
                className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-3 text-xs font-medium text-muted-foreground opacity-55"
              >
                <Link2 size={13} />
                Link India accounts
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  Coming soon
                </span>
              </button>
              <button
                onClick={() => setAdding(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-3 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/30 hover:bg-muted hover:text-foreground"
              >
                <Wallet size={13} />
                Add anything manually
              </button>
            </div>
          </Card>
        </div>
      </Reveal>

      {choosing && (
        <AddAccountChooser
          fxRate={rate}
          onLinked={addLinked}
          onManual={() => setAdding(true)}
          onClose={() => setChoosing(false)}
        />
      )}
      {adding && (
        <AccountDialog
          rate={rate}
          holdings={holdings}
          updateAccount={updateAccount}
          onClose={() => setAdding(false)}
          onSave={addManual}
        />
      )}
      {editing && (
        <AccountDialog
          rate={rate}
          holdings={holdings}
          updateAccount={updateAccount}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(h) => {
            if (editing.id) updateAccount(editing.id, h)
            setEditing(null)
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          account={deleting}
          rate={rate}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            if (deleting.id) removeAccount(deleting.id)
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

/* ── Summary strip cell ────────────────────────────────────────────────────── */

function SummaryCell({
  label,
  usd,
  sub,
  color,
  pct,
  active,
  onEnter,
  onLeave,
}: {
  label: string
  usd: number
  sub: string
  color?: string
  pct?: number
  active?: boolean
  onEnter?: () => void
  onLeave?: () => void
}) {
  return (
    <div
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className={cn('px-6 py-5 transition-colors duration-200', onEnter && 'cursor-pointer', active && 'bg-accent/40')}
    >
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <Money usd={usd} className="mt-1.5 block tabular-nums text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums" />
      <div className="mt-2 flex items-center gap-2">
        {color !== undefined && pct !== undefined && (
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                background: color,
                boxShadow: active ? `0 0 8px color-mix(in oklch, ${color} 70%, transparent)` : undefined,
              }}
            />
          </span>
        )}
        <p className="text-[13px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}

/* ── Insight item ──────────────────────────────────────────────────────────── */

const INSIGHT_TONE = {
  warning: 'bg-warning-muted/80 text-warning ring-warning/20',
  danger: 'bg-danger-muted/80 text-danger ring-danger/20',
} as const

function InsightItem({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode
  tone: keyof typeof INSIGHT_TONE
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1', INSIGHT_TONE[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

/* ── Account group (country ledger) ────────────────────────────────────────── */

function AccountGroup({
  country,
  accounts,
  rate,
  grandTotalUsd,
  accountToGoal,
  onEdit,
  onDelete,
}: {
  country: 'US' | 'IN'
  accounts: Holding[]
  rate: number
  grandTotalUsd: number
  /** accountId → name of the goal it funds (shown as a tag on the row). */
  accountToGoal: Map<string, string>
  onEdit: (h: Holding) => void
  onDelete: (h: Holding) => void
}) {
  const { flag, name, color } = COUNTRY_META[country]
  const [activeSlice, setActiveSlice] = useState<number | null>(null)
  const total = accounts.reduce((s, h) => s + usdValue(h, rate), 0)
  const share = grandTotalUsd > 0 ? Math.round((total / grandTotalUsd) * 100) : 0
  const slices = useMemo(() => byAssetClass(accounts, rate), [accounts, rate])
  const sorted = useMemo(
    () => [...accounts].sort((a, b) => usdValue(b, rate) - usdValue(a, rate)),
    [accounts, rate],
  )
  // Loans secured against an asset in this group render nested under it, not standalone.
  const nestedLoanIds = useMemo(() => {
    const ids = new Set<string>()
    for (const h of accounts) {
      if (isLiability(h) && h.id && h.securedAgainstId && accounts.some((a) => a.id === h.securedAgainstId)) {
        ids.add(h.id)
      }
    }
    return ids
  }, [accounts])
  const topLevel = sorted.filter((h) => !(h.id && nestedLoanIds.has(h.id)))

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      {/* Group header */}
      <div
        className="flex items-center gap-2.5 border-b border-border/60 px-5 py-3.5"
        style={{ background: `linear-gradient(90deg, color-mix(in oklch, ${color} 5%, var(--card)), var(--card) 65%)` }}
      >
        <span
          className="flex size-8 items-center justify-center rounded-xl text-base"
          style={{
            background: `color-mix(in oklch, ${color} 10%, var(--card))`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 18%, transparent)`,
          }}
        >
          {flag}
        </span>
        <h2 className="text-[15px] font-semibold">{name}</h2>
        <span
          className="rounded-full px-2 py-0.5 tabular-nums text-[11px] font-bold tabular-nums"
          style={{ background: `color-mix(in oklch, ${color} 13%, transparent)`, color }}
        >
          {accounts.length}
        </span>
        <Money usd={total} className="ml-auto tabular-nums text-[15px] font-semibold tabular-nums" />
      </div>

      {/* Jurisdiction mix — what this money actually is */}
      <div className="flex items-center gap-5 border-b border-border/60 bg-muted/30 px-5 py-4">
        <Donut
          size={88}
          thickness={11}
          segments={slices.map((s) => ({ value: s.usd, color: s.colorVar }))}
          activeIndex={activeSlice}
          onHover={setActiveSlice}
        >
          {activeSlice !== null && slices[activeSlice] ? (
            <div key={activeSlice} className="animate-fade-in">
              <p className="tabular-nums text-sm font-bold tabular-nums" style={{ color: slices[activeSlice].colorVar }}>
                {slices[activeSlice].pct.toFixed(0)}%
              </p>
              <p className="mx-auto max-w-[54px] truncate text-[9px] leading-tight text-muted-foreground">
                {slices[activeSlice].label}
              </p>
            </div>
          ) : (
            <div key="share" className="animate-fade-in">
              <p className="tabular-nums text-sm font-bold tabular-nums" style={{ color }}>
                {share}%
              </p>
              <p className="text-[10px] leading-tight text-muted-foreground">of total</p>
            </div>
          )}
        </Donut>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
          {slices.map((s, i) => (
            <div
              key={s.key}
              onPointerEnter={() => setActiveSlice(i)}
              onPointerLeave={() => setActiveSlice(null)}
              className={cn(
                '-mx-1.5 -my-1 min-w-0 cursor-pointer rounded-lg px-1.5 py-1 transition-all duration-200',
                activeSlice === i && 'bg-card shadow-[0_1px_3px_hsl(var(--shadow-color)/0.08)]',
                activeSlice !== null && activeSlice !== i && 'opacity-40',
              )}
            >
              <div className="flex items-center gap-1.5 text-[13px]">
                <span
                  className="size-2 shrink-0 rounded-[4px] transition-transform duration-200"
                  style={{
                    background: s.colorVar,
                    transform: activeSlice === i ? 'scale(1.35)' : undefined,
                    boxShadow: activeSlice === i ? `0 0 6px color-mix(in oklch, ${s.colorVar} 60%, transparent)` : undefined,
                  }}
                />
                <span className="truncate font-medium">{s.label}</span>
                <span className="ml-auto tabular-nums font-semibold tabular-nums">{s.pct.toFixed(0)}%</span>
              </div>
              <p className="mt-0.5 pl-3.5 tabular-nums text-[11px] tabular-nums text-muted-foreground">
                {formatUSD(s.usd)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/40">
        {topLevel.map((a) => {
          const secured = isLiability(a) ? [] : loansSecuredBy(a.id, accounts)
          if (secured.length === 0) {
            return (
              <AccountRow
                key={a.id ?? a.nickname}
                a={a}
                color={color}
                rate={rate}
                accountToGoal={accountToGoal}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            )
          }
          return (
            <div key={a.id ?? a.nickname}>
              <AccountRow
                a={a}
                color={color}
                rate={rate}
                accountToGoal={accountToGoal}
                onEdit={onEdit}
                onDelete={onDelete}
              />
              {secured.map((loan) => (
                <AccountRow
                  key={loan.id}
                  a={loan}
                  color={color}
                  rate={rate}
                  accountToGoal={accountToGoal}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  indent
                />
              ))}
              <div className="flex items-center justify-between gap-3.5 bg-muted/25 py-2 pl-[4.5rem] pr-5">
                <span className="text-[12px] font-medium text-muted-foreground">Equity</span>
                <Money
                  usd={assetEquity(a, accounts, rate)}
                  className="shrink-0 text-right tabular-nums text-[13px] font-semibold tabular-nums"
                />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function AccountRow({
  a,
  color,
  rate,
  accountToGoal,
  onEdit,
  onDelete,
  indent = false,
}: {
  a: Holding
  color: string
  rate: number
  accountToGoal: Map<string, string>
  onEdit: (h: Holding) => void
  onDelete: (h: Holding) => void
  indent?: boolean
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3.5 transition-colors hover:bg-accent/35',
        indent ? 'py-2.5 pl-[4.5rem] pr-5' : 'px-5 py-3.5',
      )}
    >
      {!indent && <Monogram institution={a.institution} color={color} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn('truncate font-medium', indent ? 'text-[13px]' : 'text-[15px]')}>{a.nickname}</p>
          {isLiability(a) && (
            <span className="shrink-0 rounded bg-danger/12 px-1 py-px text-[10px] font-bold uppercase text-danger ring-1 ring-danger/20">
              Debt
            </span>
          )}
          {a.isPfic && (
            <span className="shrink-0 rounded bg-warning/12 px-1 py-px text-[10px] font-bold uppercase text-warning ring-1 ring-warning/20">
              PFIC
            </span>
          )}
          <SourceBadge source={a.source} />
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-muted-foreground">
          <span className="truncate">
            {a.institution} · {TYPE_LABELS[a.accountType] ?? a.accountType}
            {detailSummary(a.details) ? ` · ${detailSummary(a.details)}` : ''}
          </span>
          {a.id && accountToGoal.has(a.id) && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded bg-brand/10 px-1.5 py-px text-[10.5px] font-medium text-brand"
              title={`Funds your “${accountToGoal.get(a.id)}” goal`}
            >
              <Link2 size={10} />
              {accountToGoal.get(a.id)}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <button
          onClick={() => onEdit(a)}
          aria-label={`Edit ${a.nickname}`}
          title="Edit"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(a)}
          aria-label={`Delete ${a.nickname}`}
          title="Delete"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-muted hover:text-danger"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <Money
        usd={usdValue(a, rate)}
        className={cn('shrink-0 text-right font-semibold tabular-nums', indent ? 'text-[13px]' : 'text-[15px]')}
      />
    </div>
  )
}

function Monogram({ institution, color }: { institution: string; color: string }) {
  const initials = institution
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold transition-transform group-hover:scale-105"
      style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${color} 14%, var(--card)), color-mix(in oklch, ${color} 7%, var(--card)))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 22%, transparent)`,
        color,
      }}
    >
      {initials}
    </span>
  )
}

function SourceBadge({ source }: { source: Holding['source'] }) {
  if (source === 'manual') return null
  const map: Record<string, { label: string }> = {
    plaid: { label: 'Plaid' },
    setu: { label: 'Setu' },
    pdf_upload: { label: 'PDF' },
  }
  const m = map[source]
  if (!m) return null
  return (
    <span className="shrink-0 rounded bg-accent px-1 py-px text-[10px] font-medium uppercase tracking-wide text-accent-foreground/80 ring-1 ring-border/60">
      {m.label}
    </span>
  )
}

/* ── Add / edit account dialog ─────────────────────────────────────────────── */

const US_TYPES: AccountType[] = ['checking', 'savings', 'cd', 'brokerage', 'bond', '401k', 'ira', 'roth_ira', 'real_estate', 'vehicle', 'notes_receivable', 'other']
const IN_TYPES: AccountType[] = ['nre', 'nro', 'fcnr', 'fd', 'mutual_fund', 'property', 'gold', 'vehicle', 'notes_receivable', 'other']
const US_LIABILITY_TYPES: AccountType[] = ['mortgage', 'heloc', 'auto_loan', 'student_loan', 'credit_card', 'personal_loan', 'notes_payable', 'other_debt']
const IN_LIABILITY_TYPES: AccountType[] = ['home_loan', 'auto_loan', 'education_loan', 'credit_card', 'personal_loan', 'notes_payable', 'other_debt']

/** First type to default to for a given country + asset/liability kind. */
function firstType(country: 'US' | 'IN', kind: 'asset' | 'liability'): AccountType {
  if (kind === 'liability') return country === 'US' ? 'mortgage' : 'home_loan'
  return country === 'US' ? 'checking' : 'nre'
}

/** Polished account-type dropdown — portals out so it's never clipped by the modal. */
function TypeSelect({
  value,
  options,
  onChange,
  liability,
}: {
  value: AccountType
  options: AccountType[]
  onChange: (t: AccountType) => void
  liability: boolean
}) {
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as AccountType)}>
      <Select.Trigger
        className={cn(
          inputCls,
          'flex items-center justify-between gap-2 text-left data-[popup-open]:border-brand data-[popup-open]:bg-card data-[popup-open]:ring-[3px] data-[popup-open]:ring-brand/12',
        )}
      >
        <Select.Value>{(v) => TYPE_LABELS[v as string] ?? (v as string)}</Select.Value>
        <Select.Icon className="shrink-0 text-muted-foreground transition-transform duration-200 data-[popup-open]:rotate-180">
          <ChevronDown size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50 outline-none">
          <Select.Popup className="max-h-72 w-[var(--anchor-width)] origin-top overflow-y-auto overscroll-contain rounded-xl border border-border/80 bg-card p-1 shadow-[0_14px_44px_-14px_hsl(var(--shadow-color)/0.5)] outline-none animate-scale-in">
            {options.map((t) => (
              <Select.Item
                key={t}
                value={t}
                className={cn(
                  'flex cursor-pointer select-none items-center justify-between rounded-lg px-2.5 py-2 text-[13px] outline-none transition-colors',
                  liability
                    ? 'data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger data-[selected]:bg-danger/10 data-[selected]:font-medium data-[selected]:text-danger'
                    : 'data-[highlighted]:bg-success/10 data-[highlighted]:text-success data-[selected]:bg-success/10 data-[selected]:font-medium data-[selected]:text-success',
                )}
              >
                <Select.ItemText>{TYPE_LABELS[t] ?? t}</Select.ItemText>
                <Select.ItemIndicator className="shrink-0">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

/** "Secured against" picker for a loan — lists securable assets, plus "Not secured". */
function AssetSelect({
  value,
  assets,
  onChange,
}: {
  value: string | undefined
  assets: Holding[]
  onChange: (id: string | undefined) => void
}) {
  return (
    <Select.Root value={value ?? ''} onValueChange={(v) => onChange((v as string) || undefined)}>
      <Select.Trigger
        className={cn(
          inputCls,
          'flex items-center justify-between gap-2 text-left data-[popup-open]:border-brand data-[popup-open]:bg-card data-[popup-open]:ring-[3px] data-[popup-open]:ring-brand/12',
        )}
      >
        <Select.Value>{(v) => assets.find((a) => a.id === v)?.nickname ?? 'Not secured'}</Select.Value>
        <Select.Icon className="shrink-0 text-muted-foreground transition-transform duration-200 data-[popup-open]:rotate-180">
          <ChevronDown size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50 outline-none">
          <Select.Popup className="max-h-72 w-[var(--anchor-width)] overflow-y-auto overscroll-contain rounded-xl border border-border/80 bg-card p-1 shadow-[0_14px_44px_-14px_hsl(var(--shadow-color)/0.5)] outline-none animate-scale-in">
            {[null, ...assets].map((a) => (
              <Select.Item
                key={a?.id ?? '__none'}
                value={a?.id ?? ''}
                className="flex cursor-pointer select-none items-center justify-between rounded-lg px-2.5 py-2 text-[13px] outline-none transition-colors data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger data-[selected]:bg-danger/10 data-[selected]:font-medium data-[selected]:text-danger"
              >
                <Select.ItemText>
                  {a ? (
                    <>
                      {a.nickname}
                      <span className="text-muted-foreground"> · {TYPE_LABELS[a.accountType] ?? a.accountType}</span>
                    </>
                  ) : (
                    'Not secured'
                  )}
                </Select.ItemText>
                <Select.ItemIndicator className="shrink-0">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

const COMPOUNDING_LABELS: Record<NonNullable<HoldingDetails['compounding']>, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  annually: 'Annually',
  maturity: 'At maturity',
}

const FCNR_CURRENCIES: NonNullable<HoldingDetails['depositCurrency']>[] = ['USD', 'GBP', 'EUR', 'CAD', 'AUD']

/**
 * Which detail fields surface for a given country × type. `isSgb` is passed in
 * because a Sovereign Gold Bond reveals interest + maturity that physical gold
 * doesn't. Returning plain booleans keeps the form's conditional rendering flat.
 */
function detailSpec(country: 'US' | 'IN', t: AccountType, isSgb: boolean, fdScheme: 'NRE' | 'NRO') {
  // Liabilities: APR for all, a payoff date for term loans, and a min. payment.
  if (LIABILITY_TYPES.has(t)) {
    const termLoan = t !== 'credit_card' && t !== 'other_debt'
    return {
      interestRate: true,
      expectedReturn: false,
      maturityDate: termLoan,
      minPayment: true,
      compounding: false,
      depositCurrency: false,
      tdsRate: false,
      schemeToggle: false,
      goldToggle: false,
      get any() {
        return true
      },
    }
  }
  const sgbGold = country === 'IN' && t === 'gold' && isSgb
  const inFd = country === 'IN' && t === 'fd'
  // A note receivable is a loan you've made — it carries an interest rate and a
  // repayment (due) date, just like the loans on the liability side.
  const interestRate = ['savings', 'nre', 'nro', 'fcnr', 'fd', 'cd', 'bond', 'notes_receivable'].includes(t) || sgbGold
  const maturityDate = ['fcnr', 'fd', 'cd', 'bond', 'notes_receivable'].includes(t) || sgbGold
  // Growth assets have no fixed coupon, so projections lean on a per-type default
  // return — let the user override it with their own estimate for this account.
  const expectedReturn =
    ['brokerage', '401k', 'ira', 'roth_ira', 'mutual_fund', 'real_estate', 'property', 'gold'].includes(t) && !sgbGold
  return {
    interestRate,
    expectedReturn,
    maturityDate,
    minPayment: false,
    compounding: ['fcnr', 'fd', 'cd'].includes(t),
    depositCurrency: t === 'fcnr',
    // NRO interest is taxable (TDS). An NRE FD is tax-free, so no TDS field.
    tdsRate: (country === 'IN' && t === 'nro') || (inFd && fdScheme === 'NRO'),
    schemeToggle: inFd,
    goldToggle: country === 'IN' && t === 'gold',
    /** True when the type carries any detail field worth a section header. */
    get any() {
      return (
        this.interestRate ||
        this.expectedReturn ||
        this.maturityDate ||
        this.compounding ||
        this.depositCurrency ||
        this.tdsRate ||
        this.schemeToggle ||
        this.goldToggle
      )
    },
  }
}

/** Compact, human one-liner of a holding's populated details — for the row. */
function detailSummary(d: HoldingDetails | undefined): string | null {
  if (!d) return null
  const parts: string[] = []
  if (d.fdScheme) parts.push(d.fdScheme)
  if (d.isSgb) parts.push('SGB')
  if (d.depositCurrency) parts.push(d.depositCurrency)
  if (typeof d.interestRate === 'number') parts.push(`${d.interestRate}%`)
  if (typeof d.tdsRate === 'number') parts.push(`${d.tdsRate}% TDS`)
  if (d.maturityDate) {
    const dt = new Date(d.maturityDate + 'T00:00:00')
    if (!Number.isNaN(dt.getTime())) {
      parts.push(
        `matures ${dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
      )
    }
  }
  return parts.length ? parts.join(' · ') : null
}

/** Close-on-Escape for modals. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

function AccountDialog({
  rate,
  holdings,
  updateAccount,
  initial,
  onClose,
  onSave,
}: {
  rate: number
  /** All holdings — used to offer/manage loan↔asset links. */
  holdings: Holding[]
  /** Persist a change to another holding (used to link/unlink secured loans). */
  updateAccount: (id: string, h: Holding) => void
  /** When set, the dialog edits this holding instead of creating a new one. */
  initial?: Holding
  onClose: () => void
  onSave: (h: Holding) => void
}) {
  const isEdit = !!initial
  const [country, setCountry] = useState<'US' | 'IN'>(initial?.country ?? 'US')
  const [kind, setKind] = useState<'asset' | 'liability'>(initial && isLiability(initial) ? 'liability' : 'asset')
  const [nickname, setNickname] = useState(initial?.nickname ?? '')
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [accountType, setAccountType] = useState<AccountType>(initial?.accountType ?? 'checking')
  const [amount, setAmount] = useState(() =>
    initial
      ? String(Math.round(initial.country === 'US' ? initial.balanceUsd : initial.balanceInr))
      : '',
  )
  // ── Instrument-specific detail fields (only some surface per country × type) ──
  const d0 = initial?.details
  const [interestRate, setInterestRate] = useState(d0?.interestRate != null ? String(d0.interestRate) : '')
  const [maturityDate, setMaturityDate] = useState(d0?.maturityDate ?? '')
  const [compounding, setCompounding] = useState<NonNullable<HoldingDetails['compounding']>>(d0?.compounding ?? 'quarterly')
  const [depositCurrency, setDepositCurrency] = useState<NonNullable<HoldingDetails['depositCurrency']>>(d0?.depositCurrency ?? 'USD')
  const [tdsRate, setTdsRate] = useState(d0?.tdsRate != null ? String(d0.tdsRate) : '')
  const [fdScheme, setFdScheme] = useState<NonNullable<HoldingDetails['fdScheme']>>(d0?.fdScheme ?? 'NRE')
  const [isSgb, setIsSgb] = useState(d0?.isSgb ?? false)
  const [minPayment, setMinPayment] = useState(d0?.minPayment != null ? String(d0.minPayment) : '')
  const [expReturn, setExpReturn] = useState(d0?.expectedReturn != null ? String(d0.expectedReturn) : '')
  useEscape(onClose)

  const liability = kind === 'liability'
  const cur = country === 'US' ? 'USD' : 'INR'
  const assetTypes = country === 'US' ? US_TYPES : IN_TYPES
  const liabilityTypes = country === 'US' ? US_LIABILITY_TYPES : IN_LIABILITY_TYPES
  const types = liability ? liabilityTypes : assetTypes
  const spec = detailSpec(country, accountType, isSgb, fdScheme)
  const valid = nickname.trim() && institution.trim() && Number(amount) > 0

  // Asset-side loan linking — for any securable asset being edited (it has an id).
  const canSecure = SECURABLE_ASSET_TYPES.has(accountType)
  const editingAssetId = isEdit && !liability && canSecure ? initial?.id : undefined
  const loanOptions = editingAssetId ? holdings.filter((h) => isLiability(h) && h.id) : []
  const assetUsdNow = country === 'US' ? Number(amount || 0) : Number(amount || 0) / rate
  const linkedLoansUsd = loanOptions
    .filter((l) => l.securedAgainstId === editingAssetId)
    .reduce((s, l) => s + Math.abs(usdValue(l, rate)), 0)
  const equityPreview = assetUsdNow - linkedLoansUsd

  // Loan-side linking — what assets this loan can be secured against.
  const securableAssets = liability ? holdings.filter((h) => isSecurableAsset(h) && h.id) : []
  const [securedAgainstId, setSecuredAgainstId] = useState<string | undefined>(initial?.securedAgainstId)

  /** Collect only the detail fields that apply to this type and are filled in. */
  function buildDetails(): HoldingDetails | undefined {
    const det: HoldingDetails = {}
    if (spec.interestRate && interestRate.trim() !== '') det.interestRate = Number(interestRate)
    if (spec.maturityDate && maturityDate) det.maturityDate = maturityDate
    if (spec.compounding) det.compounding = compounding
    if (spec.depositCurrency) det.depositCurrency = depositCurrency
    if (spec.schemeToggle) det.fdScheme = fdScheme
    if (spec.tdsRate && tdsRate.trim() !== '') det.tdsRate = Number(tdsRate)
    if (spec.minPayment && minPayment.trim() !== '') det.minPayment = Number(minPayment)
    if (spec.expectedReturn && expReturn.trim() !== '') det.expectedReturn = Number(expReturn)
    if (spec.goldToggle && isSgb) det.isSgb = true
    return Object.keys(det).length ? det : undefined
  }

  function submit() {
    if (!valid) return
    const amt = Number(amount)
    const h: Holding = {
      id: initial?.id,
      nickname: nickname.trim(),
      institution: institution.trim(),
      accountType,
      country,
      balanceUsd: country === 'US' ? amt : amt / rate,
      balanceInr: country === 'US' ? amt * rate : amt,
      isPfic: !liability && country === 'IN' && accountType === 'mutual_fund',
      source: initial?.source ?? 'manual',
      kind,
      securedAgainstId: liability ? securedAgainstId : undefined,
      details: buildDetails(),
    }
    onSave(h)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className={cn(
          'card-surface relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden p-0 ring-2 transition-shadow duration-500 animate-scale-in',
          liability ? 'ring-danger/60' : 'ring-success/60',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative shrink-0 border-b border-border/60 px-6 pb-5 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition-colors duration-500',
                  liability ? 'bg-danger/12 text-danger ring-danger/20' : 'bg-success/12 text-success ring-success/20',
                )}
              >
                {liability ? <CreditCard size={19} /> : <Wallet size={19} />}
              </span>
              <div>
                <h2 className="font-serif text-[1.2rem] font-medium tracking-tight">
                  {isEdit ? 'Edit account' : liability ? 'Add a liability' : 'Add an account'}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isEdit ? `Update “${initial.nickname}”` : 'Track what you own or owe, in either country'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="btn-ghost -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-5">
          {/* Asset / Liability — sliding segmented selector (pill glides green↔red) */}
          <div>
            <div className="relative grid grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-muted/60 p-1.5">
              {(['asset', 'liability'] as const).map((k) => {
                const active = kind === k
                const isLia = k === 'liability'
                const Icon = isLia ? CreditCard : Coins
                return (
                  <button
                    key={k}
                    onClick={() => {
                      setKind(k)
                      setAccountType(firstType(country, k))
                    }}
                    className="relative z-10 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-colors duration-200"
                  >
                    {active && (
                      <motion.span
                        layoutId="kindPill"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 -z-10 rounded-xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.3)]"
                        style={{ backgroundColor: isLia ? 'var(--danger)' : 'var(--success)' }}
                      />
                    )}
                    <Icon size={15} className={cn(active ? 'text-white' : 'text-muted-foreground')} />
                    <span className={cn(active ? 'text-white' : 'text-muted-foreground')}>
                      {isLia ? 'Liability' : 'Asset'}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
              {liability
                ? 'Something you owe — loans, credit cards, a mortgage.'
                : 'Something you own — cash, investments, property.'}
            </p>
          </div>

          {/* Country segmented */}
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-muted-foreground">Where is it held?</p>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/70 p-1">
              {(['US', 'IN'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setCountry(c)
                    setAccountType(firstType(c, kind))
                  }}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all',
                    country === c
                      ? 'bg-card shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] ring-1 ring-border/70'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="text-sm leading-none">{c === 'US' ? '🇺🇸' : '🇮🇳'}</span>
                  {c === 'US' ? 'United States' : 'India'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nickname">
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={liability ? 'e.g. Chase Mortgage' : 'e.g. Chase Checking'} className={inputCls} />
            </Field>
            <Field label={liability ? 'Lender' : 'Institution'}>
              <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Chase" className={inputCls} />
            </Field>
          </div>
          <Field label="Type">
            <TypeSelect value={accountType} options={types} onChange={setAccountType} liability={liability} />
          </Field>
          <Field label={liability ? 'Amount owed' : 'Balance'}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground/80">
                {cur === 'USD' ? '$' : '₹'}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                className={cn(inputCls, 'h-11 pl-8 text-base tabular-nums')}
              />
            </div>
          </Field>
          {accountType === 'mutual_fund' && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-muted/60 px-3 py-2.5 text-[13px] leading-snug text-warning ring-1 ring-warning/20">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>India mutual funds are auto-flagged as PFIC (Form 8621).</span>
            </p>
          )}

          {/* ── Instrument details — only the fields this type actually has ──── */}
          {spec.any && (
            <div className="mt-1 flex flex-col gap-3.5 rounded-xl bg-muted/35 p-4 ring-1 ring-border/50">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                Details
              </p>

              {spec.schemeToggle && (
                <Field label="Deposit scheme">
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/70 p-1">
                    {(['NRE', 'NRO'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFdScheme(s)}
                        className={cn(
                          'rounded-lg py-1.5 text-xs font-medium transition-all',
                          fdScheme === s
                            ? 'bg-card shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] ring-1 ring-border/70'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {s} FD
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {fdScheme === 'NRE'
                      ? 'Interest is tax-free in India and fully repatriable — no TDS.'
                      : 'Interest is taxable in India — TDS applies.'}
                  </span>
                </Field>
              )}

              {spec.goldToggle && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isSgb}
                    onChange={(e) => setIsSgb(e.target.checked)}
                    className="mt-0.5 size-4 accent-[var(--brand)]"
                  />
                  <span className="text-[13px] leading-snug">
                    <span className="font-medium">Sovereign Gold Bond</span>
                    <span className="block text-muted-foreground">Earns interest and has a maturity date, unlike physical gold.</span>
                  </span>
                </label>
              )}

              {(spec.interestRate || spec.tdsRate || spec.minPayment) && (
                <div className="grid grid-cols-2 gap-3">
                  {spec.interestRate && (
                    <Field label={liability ? 'APR (%)' : 'Interest rate (%)'}>
                      <input
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal"
                        placeholder={liability ? 'e.g. 6.5' : 'e.g. 7.1'}
                        className={cn(inputCls, 'tabular-nums')}
                      />
                    </Field>
                  )}
                  {spec.tdsRate && (
                    <Field label="TDS withheld (%)">
                      <input
                        value={tdsRate}
                        onChange={(e) => setTdsRate(e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal"
                        placeholder="e.g. 30"
                        className={cn(inputCls, 'tabular-nums')}
                      />
                    </Field>
                  )}
                  {spec.minPayment && (
                    <Field label={`Min. payment (${cur})`}>
                      <input
                        value={minPayment}
                        onChange={(e) => setMinPayment(e.target.value.replace(/[^0-9.]/g, ''))}
                        inputMode="decimal"
                        placeholder="0"
                        className={cn(inputCls, 'tabular-nums')}
                      />
                    </Field>
                  )}
                </div>
              )}

              {spec.expectedReturn && (
                <Field label="Expected return (%)">
                  <input
                    value={expReturn}
                    onChange={(e) => setExpReturn(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    placeholder={`Default ${(typeExpectedReturn(accountType) * 100).toFixed(1)} — your estimate for projections`}
                    className={cn(inputCls, 'tabular-nums')}
                  />
                </Field>
              )}

              {(spec.maturityDate || spec.compounding) && (
                <div className="grid grid-cols-2 gap-3">
                  {spec.maturityDate && (
                    <Field label={liability ? 'Payoff date' : 'Maturity date'}>
                      <input
                        type="date"
                        value={maturityDate}
                        onChange={(e) => setMaturityDate(e.target.value)}
                        className={cn(inputCls, 'tabular-nums')}
                      />
                    </Field>
                  )}
                  {spec.compounding && (
                    <Field label="Compounding">
                      <select
                        value={compounding}
                        onChange={(e) => setCompounding(e.target.value as NonNullable<HoldingDetails['compounding']>)}
                        className={inputCls}
                      >
                        {(Object.keys(COMPOUNDING_LABELS) as (keyof typeof COMPOUNDING_LABELS)[]).map((k) => (
                          <option key={k} value={k}>
                            {COMPOUNDING_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              )}

              {spec.depositCurrency && (
                <Field label="Held in currency">
                  <select
                    value={depositCurrency}
                    onChange={(e) => setDepositCurrency(e.target.value as NonNullable<HoldingDetails['depositCurrency']>)}
                    className={inputCls}
                  >
                    {FCNR_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-muted-foreground">
                    FCNR deposits are held in foreign currency, not INR.
                  </span>
                </Field>
              )}
            </div>
          )}

          {/* ── Secured against — tie this loan to the asset it finances ── */}
          {liability && (
            <Field label="Secured against (optional)">
              {securableAssets.length > 0 ? (
                <AssetSelect value={securedAgainstId} assets={securableAssets} onChange={setSecuredAgainstId} />
              ) : (
                <p className="text-[12px] leading-snug text-muted-foreground">
                  Add an asset (home, vehicle, gold, brokerage…) first, then you can secure this loan against it.
                </p>
              )}
            </Field>
          )}

          {/* ── Linked loans — attach mortgages/HELOCs to this property for equity ── */}
          {editingAssetId && (
            <div className="flex flex-col gap-2.5 rounded-xl bg-muted/35 p-4 ring-1 ring-border/50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                  Linked loans
                </p>
                {linkedLoansUsd > 0 && (
                  <span className="text-[12px] text-muted-foreground">
                    Equity{' '}
                    <span className="font-semibold text-foreground tabular-nums">{formatUSD(equityPreview)}</span>
                  </span>
                )}
              </div>
              {loanOptions.length === 0 ? (
                <p className="text-[12px] leading-snug text-muted-foreground">
                  No loans yet. Add a liability first, then come back here to secure it against this property.
                </p>
              ) : (
                loanOptions.map((loan) => {
                  const linked = loan.securedAgainstId === editingAssetId
                  const elsewhere = !linked && !!loan.securedAgainstId
                  return (
                    <label key={loan.id} className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={linked}
                        onChange={() =>
                          updateAccount(loan.id!, {
                            ...loan,
                            securedAgainstId: linked ? undefined : editingAssetId,
                          })
                        }
                        className="size-4 shrink-0 accent-[var(--danger)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {loan.nickname}
                        <span className="text-muted-foreground"> · {TYPE_LABELS[loan.accountType] ?? loan.accountType}</span>
                        {elsewhere && <span className="ml-1 text-[11px] text-muted-foreground">(linked elsewhere)</span>}
                      </span>
                      <span className="shrink-0 text-[12px] font-medium tabular-nums text-danger">
                        −{formatUSD(Math.abs(usdValue(loan, rate)))}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_2px_8px_-2px_rgba(0,0,0,0.25)] transition-all hover:brightness-110 active:translate-y-px disabled:pointer-events-none disabled:opacity-40',
              liability ? 'bg-danger' : 'bg-success',
            )}
          >
            {!isEdit && <Plus size={14} />}
            {isEdit ? 'Save changes' : liability ? 'Add liability' : 'Add account'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Delete confirmation ───────────────────────────────────────────────────── */

function ConfirmDeleteDialog({
  account,
  rate,
  onCancel,
  onConfirm,
}: {
  account: Holding
  rate: number
  onCancel: () => void
  onConfirm: () => void
}) {
  useEscape(onCancel)
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-md animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="card-surface relative w-full max-w-sm overflow-hidden p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-muted/80 text-danger ring-1 ring-danger/20">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-base font-medium tracking-tight">Remove this account?</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{account.nickname}</span>{' '}
              ({account.institution} · {TYPE_LABELS[account.accountType] ?? account.accountType}) holding{' '}
              <Money usd={usdValue(account, rate)} className="tabular-nums font-semibold tabular-nums text-foreground" />{' '}
              will be removed from your net worth, compliance checks, and allocation.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-danger px-4 py-2 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_2px_8px_-2px_color-mix(in_oklch,var(--danger)_50%,transparent)] transition-all hover:brightness-110 active:translate-y-px"
          >
            Remove account
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm shadow-[inset_0_1px_2px_hsl(var(--shadow-color)/0.04)] outline-none transition-all placeholder:text-muted-foreground/70 focus:border-brand focus:bg-card focus:ring-[3px] focus:ring-brand/12'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
