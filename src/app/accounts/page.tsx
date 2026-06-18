'use client'

import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { useCurrency } from '@/context/CurrencyContext'
import { useAccounts } from '@/context/AccountsContext'
import { formatUSD, formatINR } from '@/lib/currency'
import {
  netWorth,
  byAssetClass,
  usdValue,
  pficHoldings,
  TYPE_LABELS,
  type Holding,
} from '@/lib/portfolio'
import type { AccountType } from '@/types/accounts'
import { Card, CardHeader } from '@/components/ui/Card'
import { Donut } from '@/components/ui/charts'
import { Money } from '@/components/ui/Money'
import { Reveal } from '@/components/ui/Reveal'
import { PlaidConnect } from '@/components/PlaidConnect'
import { cn } from '@/lib/utils'

type CountryFilter = 'all' | 'US' | 'IN'

const COUNTRY_META = {
  US: { flag: '🇺🇸', name: 'United States', color: 'var(--us)' },
  IN: { flag: '🇮🇳', name: 'India', color: 'var(--india)' },
} as const

export default function AccountsPage() {
  const { rate } = useCurrency()
  const { holdings, addLinked, addManual, updateAccount, removeAccount } = useAccounts()
  const [adding, setAdding] = useState(false)
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
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight">Accounts</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Everything you own, across both countries
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
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
              <p className="text-[13px] font-medium text-muted-foreground">Total balance</p>
              <Money usd={nw.totalUsd} className="mt-1.5 block font-mono text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums" />
              <p className="mt-2 text-[13px] text-muted-foreground">{holdings.length} accounts</p>
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
                  className="animate-fade-in font-mono text-[12px] font-bold tabular-nums"
                  style={{ color: jurHover === 0 ? 'var(--us)' : 'var(--india)' }}
                >
                  {jurHover === 0 ? nw.usPct : nw.inPct}%
                </span>
              ) : (
                <span key="split" className="animate-fade-in font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
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
                  'rounded-full px-1.5 py-px font-mono text-[10px] font-semibold tabular-nums',
                  filter === t.key ? 'bg-brand-muted text-brand' : 'bg-muted text-muted-foreground',
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
              <button className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-3 text-xs font-medium text-muted-foreground transition-all hover:border-india/50 hover:bg-india-muted/40 hover:text-india">
                <Link2 size={13} />
                Link India accounts via Setu or PDF
              </button>
              <button
                onClick={() => setAdding(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-3 text-xs font-medium text-muted-foreground transition-all hover:border-brand/50 hover:bg-brand-muted/40 hover:text-brand"
              >
                <Wallet size={13} />
                Add anything manually
              </button>
            </div>
          </Card>
        </div>
      </Reveal>

      {adding && (
        <AccountDialog rate={rate} onClose={() => setAdding(false)} onSave={addManual} />
      )}
      {editing && (
        <AccountDialog
          rate={rate}
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
      <Money usd={usd} className="mt-1.5 block font-mono text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums" />
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
  onEdit,
  onDelete,
}: {
  country: 'US' | 'IN'
  accounts: Holding[]
  rate: number
  grandTotalUsd: number
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
          className="rounded-full px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums"
          style={{ background: `color-mix(in oklch, ${color} 13%, transparent)`, color }}
        >
          {accounts.length}
        </span>
        <Money usd={total} className="ml-auto font-mono text-[15px] font-semibold tabular-nums" />
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
              <p className="font-mono text-sm font-bold tabular-nums" style={{ color: slices[activeSlice].colorVar }}>
                {slices[activeSlice].pct.toFixed(0)}%
              </p>
              <p className="mx-auto max-w-[54px] truncate text-[9px] leading-tight text-muted-foreground">
                {slices[activeSlice].label}
              </p>
            </div>
          ) : (
            <div key="share" className="animate-fade-in">
              <p className="font-mono text-sm font-bold tabular-nums" style={{ color }}>
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
                <span className="ml-auto font-mono font-semibold tabular-nums">{s.pct.toFixed(0)}%</span>
              </div>
              <p className="mt-0.5 pl-3.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatUSD(s.usd)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/40">
        {sorted.map((a) => (
          <div
            key={a.id ?? a.nickname}
            className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-accent/35"
          >
            <Monogram institution={a.institution} color={color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[15px] font-medium">{a.nickname}</p>
                {a.isPfic && (
                  <span className="shrink-0 rounded bg-warning/12 px-1 py-px text-[10px] font-bold uppercase text-warning ring-1 ring-warning/20">
                    PFIC
                  </span>
                )}
                <SourceBadge source={a.source} />
              </div>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {a.institution} · {TYPE_LABELS[a.accountType] ?? a.accountType}
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
            <Money usd={usdValue(a, rate)} className="shrink-0 text-right font-mono text-[15px] font-semibold tabular-nums" />
          </div>
        ))}
      </div>
    </Card>
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

const US_TYPES: AccountType[] = ['checking', 'savings', 'brokerage', '401k', 'ira', 'roth_ira', 'real_estate', 'other']
const IN_TYPES: AccountType[] = ['nre', 'nro', 'fcnr', 'fd', 'mutual_fund', 'property', 'gold', 'other']

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
  initial,
  onClose,
  onSave,
}: {
  rate: number
  /** When set, the dialog edits this holding instead of creating a new one. */
  initial?: Holding
  onClose: () => void
  onSave: (h: Holding) => void
}) {
  const isEdit = !!initial
  const [country, setCountry] = useState<'US' | 'IN'>(initial?.country ?? 'US')
  const [nickname, setNickname] = useState(initial?.nickname ?? '')
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [accountType, setAccountType] = useState<AccountType>(initial?.accountType ?? 'checking')
  const [amount, setAmount] = useState(() =>
    initial
      ? String(Math.round(initial.country === 'US' ? initial.balanceUsd : initial.balanceInr))
      : '',
  )
  useEscape(onClose)

  const types = country === 'US' ? US_TYPES : IN_TYPES
  const valid = nickname.trim() && institution.trim() && Number(amount) > 0

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
      isPfic: country === 'IN' && accountType === 'mutual_fund',
      source: initial?.source ?? 'manual',
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
        className="card-surface relative w-full max-w-md overflow-hidden p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0" />
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {isEdit ? 'Edit account' : 'Add an account'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isEdit ? `Update “${initial.nickname}”` : 'Track anything you own, in either country'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>

        {/* Country toggle */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/70 p-1">
          {(['US', 'IN'] as const).map((c) => (
            <button
              key={c}
              onClick={() => {
                setCountry(c)
                setAccountType(c === 'US' ? 'checking' : 'nre')
              }}
              className={cn(
                'rounded-lg py-2 text-xs font-medium transition-all',
                country === c
                  ? 'bg-card shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] ring-1 ring-border/70'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {c === 'US' ? '🇺🇸 United States' : '🇮🇳 India'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3.5">
          <Field label="Nickname">
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Chase Checking" className={inputCls} />
          </Field>
          <Field label="Institution">
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Chase" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)} className={inputCls}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Balance (${country === 'US' ? 'USD' : 'INR'})`}>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                className={cn(inputCls, 'font-mono tabular-nums')}
              />
            </Field>
          </div>
          {accountType === 'mutual_fund' && (
            <p className="rounded-xl bg-warning-muted/60 px-3 py-2 text-[13px] text-warning ring-1 ring-warning/20">
              India mutual funds are auto-flagged as PFIC (Form 8621).
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className="btn-primary rounded-xl px-4 py-2 text-[13px] font-medium disabled:pointer-events-none disabled:opacity-40"
          >
            {isEdit ? 'Save changes' : 'Add account'}
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
            <h2 className="text-base font-semibold tracking-tight">Remove this account?</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{account.nickname}</span>{' '}
              ({account.institution} · {TYPE_LABELS[account.accountType] ?? account.accountType}) holding{' '}
              <Money usd={usdValue(account, rate)} className="font-mono font-semibold tabular-nums text-foreground" />{' '}
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
