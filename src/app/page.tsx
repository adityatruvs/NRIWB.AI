'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Sparkles,
  ShieldCheck,
  Plane,
  Scale,
  Plus,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Landmark,
} from 'lucide-react'
import { useCurrency } from '@/context/CurrencyContext'
import { useAccounts } from '@/context/AccountsContext'
import { formatAmount, formatUSD } from '@/lib/currency'
import {
  netWorth,
  byAssetClass,
  complianceItems,
  fbarStatus,
  pficHoldings,
  usdValue,
  TYPE_LABELS,
  FBAR_THRESHOLD_USD,
  type ComplianceLevel,
} from '@/lib/portfolio'
import { useUser } from '@clerk/nextjs'
import { NET_WORTH_HISTORY, RESIDENCY, GOALS, TARGET_INDIA_PCT } from '@/data/mock/insights'
import { Card, CardHeader } from '@/components/ui/Card'
import { Sparkline, ProgressBar, Donut, RadialProgress } from '@/components/ui/charts'
import { Money } from '@/components/ui/Money'
import { Reveal } from '@/components/ui/Reveal'
import { PlaidConnect } from '@/components/PlaidConnect'
import { cn } from '@/lib/utils'

type CountryFilter = 'all' | 'us' | 'in'

const GREETING = (() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
})()

export default function DashboardPage() {
  const { mode, rate } = useCurrency()
  const { holdings, addLinked } = useAccounts()
  const { user } = useUser()
  const firstName = user?.firstName ?? 'there'
  const [filter, setFilter] = useState<CountryFilter>('all')
  const [activeAsset, setActiveAsset] = useState<number | null>(null)
  const [splitHover, setSplitHover] = useState<'us' | 'in' | null>(null)

  const nw = netWorth(holdings, rate)
  const heroUsd = filter === 'us' ? nw.usUsd : filter === 'in' ? nw.inUsd : nw.totalUsd

  // Rescale the history so the line ends exactly at whatever's on screen.
  const lastHist = NET_WORTH_HISTORY[NET_WORTH_HISTORY.length - 1].usd
  const series = NET_WORTH_HISTORY.map((h) => (h.usd / lastHist) * heroUsd)
  const monthDelta = series[series.length - 1] - series[series.length - 2]
  const monthPct = (monthDelta / series[series.length - 2]) * 100

  const fbar = fbarStatus(holdings, rate)
  const pfics = pficHoldings(holdings)
  const compliance = complianceItems(holdings, rate)
  const assets = byAssetClass(holdings, rate)

  const residencyPct = RESIDENCY.daysInIndia / RESIDENCY.limit
  const daysLeft = RESIDENCY.limit - RESIDENCY.daysInIndia
  const driftDelta = nw.inPct - TARGET_INDIA_PCT

  return (
    <div className="flex flex-col gap-6">
      {/* ── Greeting ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight">
            {GREETING}, {firstName}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-[15px] text-muted-foreground">
            Here&apos;s your cross-border picture
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-muted/70 px-2 py-0.5 text-[11px] font-medium text-success">
              <span className="size-1 rounded-full bg-success" />
              Synced just now
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/copilot"
            className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium"
          >
            <Sparkles size={14} />
            Ask Copilot
          </Link>
          <Link
            href="/accounts"
            className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium"
          >
            <Plus size={14} />
            Add account
          </Link>
        </div>
      </div>

      {/* ── Net worth + Needs attention ───────────────────────────────── */}
      <Reveal className="grid gap-6 lg:grid-cols-3" delay={0.04}>
        {/* Net worth hero — one story: the number and its trend */}
        <Card className="relative overflow-hidden p-6 sm:p-7 lg:col-span-2">
          <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0 opacity-70" />
          <div className="hero-mesh" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="eyebrow">Net Worth</span>
              <div className="flex gap-0.5 rounded-xl border border-border/70 bg-muted/60 p-0.5 backdrop-blur-sm">
                {(['all', 'us', 'in'] as CountryFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'rounded-[10px] px-3 py-1.5 text-xs font-medium transition-all duration-150',
                      filter === f
                        ? 'bg-card text-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] ring-1 ring-border/70'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f === 'all' ? 'Global' : f === 'us' ? '🇺🇸 US' : '🇮🇳 India'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Money
                usd={heroUsd}
                className="block font-mono text-[3.4rem] font-semibold leading-none tracking-tighter tabular-nums"
              />
              <div className="flex flex-col gap-1">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
                    monthDelta >= 0
                      ? 'bg-success-muted/80 text-success ring-success/20'
                      : 'bg-danger-muted/80 text-danger ring-danger/20',
                  )}
                >
                  <TrendingUp size={12} className={monthDelta < 0 ? 'rotate-180' : ''} />
                  {monthDelta >= 0 ? '+' : ''}
                  {formatUSD(Math.abs(monthDelta))} ({monthPct >= 0 ? '+' : ''}
                  {monthPct.toFixed(1)}%)
                </span>
                <span className="pl-1 text-xs text-muted-foreground">this month</span>
              </div>
            </div>

            {/* Where it lives: one thin split bar — hover either side to spotlight it */}
            <div className="mt-6">
              <div className="flex h-2.5 w-full gap-1 overflow-visible rounded-full">
                <div
                  onPointerEnter={() => setSplitHover('us')}
                  onPointerLeave={() => setSplitHover(null)}
                  className="h-full cursor-pointer rounded-full transition-all duration-300"
                  style={{
                    width: `${nw.usPct}%`,
                    background: 'var(--us)',
                    opacity: splitHover === 'in' ? 0.3 : 1,
                    boxShadow: splitHover === 'us' ? '0 0 10px color-mix(in oklch, var(--us) 60%, transparent)' : undefined,
                  }}
                />
                <div
                  onPointerEnter={() => setSplitHover('in')}
                  onPointerLeave={() => setSplitHover(null)}
                  className="h-full cursor-pointer rounded-full transition-all duration-300"
                  style={{
                    width: `${nw.inPct}%`,
                    background: 'var(--india)',
                    opacity: splitHover === 'us' ? 0.3 : 1,
                    boxShadow: splitHover === 'in' ? '0 0 10px color-mix(in oklch, var(--india) 60%, transparent)' : undefined,
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span
                  onPointerEnter={() => setSplitHover('us')}
                  onPointerLeave={() => setSplitHover(null)}
                  className={cn(
                    '-mx-1.5 flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-muted-foreground transition-all duration-200',
                    splitHover === 'us' && 'bg-us-muted/70 text-foreground',
                    splitHover === 'in' && 'opacity-40',
                  )}
                >
                  <span className="size-2 rounded-full bg-us" />
                  🇺🇸 US <Money usd={nw.usUsd} className="font-mono font-semibold tabular-nums text-foreground" /> · {nw.usPct}%
                </span>
                <span
                  onPointerEnter={() => setSplitHover('in')}
                  onPointerLeave={() => setSplitHover(null)}
                  className={cn(
                    '-mx-1.5 flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-muted-foreground transition-all duration-200',
                    splitHover === 'in' && 'bg-india-muted/70 text-foreground',
                    splitHover === 'us' && 'opacity-40',
                  )}
                >
                  <span className="size-2 rounded-full bg-india" />
                  🇮🇳 India <Money usd={nw.inUsd} className="font-mono font-semibold tabular-nums text-foreground" /> · {nw.inPct}%
                </span>
              </div>
            </div>

            {/* Trend, full width — hover for month-by-month values */}
            <div className="mt-auto pt-6">
              <Sparkline
                data={series}
                labels={NET_WORTH_HISTORY.map((h) => h.month)}
                format={(v) => formatAmount(v, mode, rate)}
                color="var(--brand)"
                height={56}
              />
              <p className="mt-2 text-[13px] text-muted-foreground">
                12-month trend · 1 USD = ₹{rate.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        {/* Needs attention — the single place for "what should I do?" */}
        <Card className="flex flex-col">
          <CardHeader
            title="Needs attention"
            subtitle="US ↔ India obligations"
            icon={<ShieldCheck size={15} />}
          />
          <div className="flex flex-1 flex-col gap-1.5">
            {compliance.map((item) => (
              <ComplianceRow key={item.key} level={item.level} title={item.title} detail={item.detail} meta={item.meta} />
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-brand/15 bg-brand-muted/40 px-3.5 py-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <Sparkles size={12} className="mb-0.5 mr-1 inline text-brand" />
              {pfics.length > 0 ? (
                <>
                  <span className="font-medium text-foreground">{pfics.length} India mutual fund{pfics.length > 1 ? 's' : ''}</span>{' '}
                  need Form 8621.{' '}
                </>
              ) : (
                <>You&apos;re {Math.abs(driftDelta)} pts {driftDelta < 0 ? 'below' : 'above'} your India target. </>
              )}
              <Link href="/copilot" className="font-medium text-brand hover:underline">
                Ask Copilot how to handle it →
              </Link>
            </p>
          </div>
        </Card>
      </Reveal>

      {/* ── KPI row — same shape, three different answers ─────────────── */}
      <Reveal className="grid gap-6 sm:grid-cols-3" delay={0.1}>
        <KpiCard
          label="FBAR Threshold"
          value={formatUSD(fbar.peakUsd)}
          chip={
            fbar.crossed
              ? { text: 'Filing required', tone: 'danger' }
              : fbar.pctOfThreshold > 70
                ? { text: 'Approaching', tone: 'warning' }
                : { text: 'Under limit', tone: 'success' }
          }
          ring={{
            value: Math.min(fbar.pctOfThreshold / 100, 1),
            color: fbar.crossed ? 'var(--danger)' : fbar.pctOfThreshold > 70 ? 'var(--warning)' : 'var(--success)',
            center: `${Math.round(fbar.pctOfThreshold)}%`,
          }}
          sub={
            <>
              India peak vs the {formatUSD(FBAR_THRESHOLD_USD)} filing limit
            </>
          }
        />
        <KpiCard
          label="India Residency"
          value={`${RESIDENCY.daysInIndia} days`}
          chip={{
            text: `${daysLeft} left`,
            tone: residencyPct > 0.85 ? 'danger' : residencyPct > 0.6 ? 'warning' : 'success',
            icon: <Plane size={11} />,
          }}
          ring={{
            value: residencyPct,
            color: residencyPct > 0.85 ? 'var(--danger)' : residencyPct > 0.6 ? 'var(--warning)' : 'var(--india)',
            center: `${Math.round(residencyPct * 100)}%`,
          }}
          sub={
            <>
              {RESIDENCY.limit}-day rule · crosses ~{RESIDENCY.projectedCrossDate}
            </>
          }
        />
        <KpiCard
          label="India Allocation"
          value={<Money usd={nw.inUsd} className="font-mono text-[1.6rem] font-semibold leading-none tracking-tight tabular-nums" />}
          chip={{
            text: `${driftDelta >= 0 ? '+' : ''}${driftDelta} vs target`,
            tone: Math.abs(driftDelta) <= 5 ? 'success' : 'warning',
            icon: <Scale size={11} />,
          }}
          ring={{ value: nw.inPct / 100, color: 'var(--india)', center: `${nw.inPct}%` }}
          sub={
            <>
              Target {TARGET_INDIA_PCT}% · {Math.abs(driftDelta) <= 5 ? 'on track' : 'rebalance suggested'}
            </>
          }
        />
      </Reveal>

      {/* ── Allocation + Goals ────────────────────────────────────────── */}
      <Reveal className="grid gap-6 lg:grid-cols-3" delay={0.16}>
        {/* Asset allocation — donut + bars, one source of truth */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Asset Allocation"
            subtitle="By class, across both countries"
            icon={<Scale size={15} />}
          />
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <Donut
              size={168}
              thickness={17}
              segments={assets.map((a) => ({ value: a.usd, color: a.colorVar }))}
              activeIndex={activeAsset}
              onHover={setActiveAsset}
            >
              {activeAsset !== null && assets[activeAsset] ? (
                <div key={activeAsset} className="animate-fade-in px-3">
                  <p
                    className="mx-auto max-w-[110px] truncate text-[11px] font-semibold"
                    style={{ color: assets[activeAsset].colorVar }}
                  >
                    {assets[activeAsset].label}
                  </p>
                  <p className="font-mono text-[1.6rem] font-semibold leading-tight tabular-nums">
                    {assets[activeAsset].pct.toFixed(0)}%
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatAmount(assets[activeAsset].usd, mode, rate)}
                  </p>
                </div>
              ) : (
                <div key="total" className="animate-fade-in">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                  <Money usd={nw.totalUsd} className="font-mono text-[15px] font-semibold tabular-nums" />
                </div>
              )}
            </Donut>
            <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
              {assets.map((a, i) => (
                <div
                  key={a.key}
                  onPointerEnter={() => setActiveAsset(i)}
                  onPointerLeave={() => setActiveAsset(null)}
                  className={cn(
                    '-mx-2 cursor-pointer rounded-xl px-2 py-1 transition-all duration-200',
                    activeAsset === i && 'bg-accent/50',
                    activeAsset !== null && activeAsset !== i && 'opacity-45',
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-[4px] shadow-sm transition-transform duration-200"
                        style={{
                          background: a.colorVar,
                          transform: activeAsset === i ? 'scale(1.3)' : undefined,
                          boxShadow: activeAsset === i ? `0 0 6px color-mix(in oklch, ${a.colorVar} 60%, transparent)` : undefined,
                        }}
                      />
                      <span className={cn('font-medium', activeAsset === i && 'text-foreground')}>{a.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-mono tabular-nums text-foreground">
                        {formatAmount(a.usd, mode, rate)}
                      </span>
                      <span className="w-9 text-right font-semibold tabular-nums">{a.pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <ProgressBar value={a.pct / 100} color={a.colorVar} height={6} />
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Goals */}
        <Card>
          <CardHeader title="Goals" subtitle="Across the US & India" icon={<TrendingUp size={15} />} />
          <div className="flex flex-col gap-4">
            {GOALS.map((g) => {
              const pct = g.currentUsd / g.targetUsd
              return (
                <div key={g.name}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium">{g.name}</span>
                    <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: g.accent }}>
                      {Math.round(pct * 100)}%
                    </span>
                  </div>
                  <ProgressBar value={pct} color={g.accent} height={7} />
                  <div className="mt-1.5 flex items-center justify-between text-[13px] text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {formatAmount(g.currentUsd, mode, rate)} / {formatAmount(g.targetUsd, mode, rate)}
                    </span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                      by {g.targetYear}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </Reveal>

      {/* ── Accounts preview ──────────────────────────────────────────── */}
      <Reveal delay={0.22}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip size-8">
              <Landmark size={15} />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Accounts</h2>
              <p className="text-xs text-muted-foreground">{holdings.length} across both countries</p>
            </div>
          </div>
          <Link
            href="/accounts"
            className="group flex items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <AccountColumn
            flag="🇺🇸"
            title="United States"
            color="var(--us)"
            accounts={holdings.filter((h) => h.country === 'US')}
            totalUsd={nw.usUsd}
            rate={rate}
            footer={<PlaidConnect fxRate={rate} onLinked={addLinked} />}
          />
          <AccountColumn
            flag="🇮🇳"
            title="India"
            color="var(--india)"
            accounts={holdings.filter((h) => h.country === 'IN')}
            totalUsd={nw.inUsd}
            rate={rate}
          />
        </div>
      </Reveal>
    </div>
  )
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

const CHIP_TONE = {
  success: 'bg-success-muted/80 text-success ring-success/20',
  warning: 'bg-warning-muted/80 text-warning ring-warning/20',
  danger: 'bg-danger-muted/80 text-danger ring-danger/20',
} as const

/** One consistent shape for every KPI: label, value + status chip on the left, ring on the right. */
function KpiCard({
  label,
  value,
  chip,
  ring,
  sub,
}: {
  label: string
  value: React.ReactNode
  chip: { text: string; tone: keyof typeof CHIP_TONE; icon?: React.ReactNode }
  ring: { value: number; color: string; center: string }
  sub: React.ReactNode
}) {
  return (
    <Card hover className="flex items-center gap-4">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
        <span className="eyebrow">{label}</span>
        {typeof value === 'string' ? (
          <p className="font-mono text-[1.6rem] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
        ) : (
          value
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1',
            CHIP_TONE[chip.tone],
          )}
        >
          {chip.icon}
          {chip.text}
        </span>
        <p className="text-[13px] leading-snug text-muted-foreground">{sub}</p>
      </div>
      <RadialProgress value={ring.value} color={ring.color} size={92} thickness={9}>
        <span className="font-mono text-sm font-bold tabular-nums" style={{ color: ring.color }}>
          {ring.center}
        </span>
      </RadialProgress>
    </Card>
  )
}

const LEVEL_STYLE: Record<
  ComplianceLevel,
  { icon: typeof CheckCircle2; chip: string }
> = {
  ok: { icon: CheckCircle2, chip: 'bg-success-muted/80 text-success ring-success/20' },
  attention: { icon: AlertTriangle, chip: 'bg-warning-muted/80 text-warning ring-warning/20' },
  overdue: { icon: AlertCircle, chip: 'bg-danger-muted/80 text-danger ring-danger/20' },
}

function ComplianceRow({
  level,
  title,
  detail,
  meta,
}: {
  level: ComplianceLevel
  title: string
  detail: string
  meta: string
}) {
  const { icon: Icon, chip } = LEVEL_STYLE[level]
  return (
    <div className="group flex gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-accent/40">
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 transition-transform group-hover:scale-105',
          chip,
        )}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-medium leading-snug">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
        <p className="mt-1 text-[12px] font-medium text-muted-foreground/80">{meta}</p>
      </div>
    </div>
  )
}

function AccountColumn({
  flag,
  title,
  color,
  accounts,
  totalUsd,
  rate,
  footer,
}: {
  flag: string
  title: string
  color: string
  accounts: ReturnType<typeof useAccounts>['holdings']
  totalUsd: number
  rate: number
  footer?: React.ReactNode
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="flex size-8 items-center justify-center rounded-xl text-base"
          style={{
            background: `color-mix(in oklch, ${color} 10%, var(--card))`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 18%, transparent)`,
          }}
        >
          {flag}
        </span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `color-mix(in oklch, ${color} 13%, transparent)`, color }}>
          {accounts.length}
        </span>
        <Money usd={totalUsd} className="ml-auto font-mono font-semibold tabular-nums" />
      </div>
      <div className="flex flex-col gap-1">
        {accounts.slice(0, 5).map((a, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl px-2.5 py-2 transition-colors hover:bg-accent/40"
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">{a.nickname}</p>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {a.institution} · {TYPE_LABELS[a.accountType] ?? a.accountType}
                {a.isPfic && (
                  <span className="ml-1.5 rounded bg-warning/12 px-1 py-px text-[10px] font-bold uppercase text-warning">
                    PFIC
                  </span>
                )}
              </p>
            </div>
            <Money
              usd={usdValue(a, rate)}
              className="ml-3 shrink-0 font-mono text-[15px] font-medium tabular-nums"
            />
          </div>
        ))}
        {footer && <div className="mt-1">{footer}</div>}
      </div>
    </Card>
  )
}
