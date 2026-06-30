'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  PieChart,
  Sparkles,
  RotateCcw,
  ArrowUpRight,
  TrendingUp,
  Info,
  Minus,
  Plus,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  Trash2,
} from 'lucide-react'
import { useCurrency } from '@/context/CurrencyContext'
import { useAccounts } from '@/context/AccountsContext'
import { useProfile } from '@/context/ProfileContext'
import { useGoals } from '@/context/GoalsContext'
import { goalKind } from '@/lib/goals'
import { netWorth, type Holding } from '@/lib/portfolio'
import { AnalyzerLogo } from '@/components/ui/logos'
import { Card, CardHeader } from '@/components/ui/Card'
import { Donut } from '@/components/ui/charts'
import { Money } from '@/components/ui/Money'
import { Reveal } from '@/components/ui/Reveal'
import { cn } from '@/lib/utils'
import {
  recommendedAllocation,
  currentAllocation,
  redistribute,
  roundTo100,
  activeBuckets,
  allocationFor,
  blendedReturn,
  portfolioExpectedReturn,
  riskFeedback,
  BUCKET_META,
  RISK_META,
  RISK_ORDER,
  type Allocation,
  type AllocBucket,
  type RiskLevel,
} from '@/lib/allocation'
import { formatAmount } from '@/lib/currency'
import { useBudget, BUDGET_COLORS, type BudgetCategory } from '@/context/BudgetContext'

/** Moderate long-run rate used until we have ≥3 months of tracked history. */
const MODERATE_RATE = 0.07
/** Minimum months of real net-worth history before we project from actuals. */
const MIN_HISTORY_MONTHS = 3
const END_AGE = 90

/** Annualized growth rate from a monthly net-worth series, clamped to a sane band. */
function annualizedRate(history: number[]): number {
  if (history.length < 2) return MODERATE_RATE
  const first = history[0]
  const last = history[history.length - 1]
  if (first <= 0) return MODERATE_RATE
  const annual = Math.pow(last / first, 12 / (history.length - 1)) - 1
  return Math.min(0.12, Math.max(0, annual))
}

export default function AnalyzerPage() {
  const { rate, mode } = useCurrency()
  const { holdings } = useAccounts()
  const { age: profileAge } = useProfile()

  // Default the age to the user's actual age (from their onboarding DOB) when we
  // have it; they can still adjust the slider. Falls back to 30 if unknown.
  const [age, setAge] = useState(profileAge ?? 30)
  const fromProfile = profileAge !== null && age === profileAge
  const [risk, setRisk] = useState<RiskLevel>('moderate')
  const [includeHome, setIncludeHome] = useState(false)

  const { user } = useUser()
  // Monthly income lives in the shared budget context, so it's connected
  // everywhere (the projection here, the budget panel, and anywhere else).
  const { income: monthlyIncome, setIncome, categories: budgetCategories } = useBudget()
  const { goals } = useGoals()

  const buckets = useMemo(() => activeBuckets(includeHome), [includeHome])
  const recommended = useMemo(
    () => recommendedAllocation(age, risk, includeHome),
    [age, risk, includeHome],
  )
  const current = useMemo(
    () => currentAllocation(holdings, rate, includeHome),
    [holdings, rate, includeHome],
  )

  // Current holdings as a percentage map, for the donut compare + projection.
  const currentPctMap = useMemo<Allocation>(() => {
    const map: Allocation = { stocks: 0, bonds: 0, realEstate: 0, gold: 0, cash: 0 }
    current.slices.forEach((s) => (map[s.key] = s.pct))
    return map
  }, [current])

  // The working split starts at the recommendation; the user reshapes it.
  const [working, setWorking] = useState<Allocation>(() => recommended)

  // Changing any input recomputes the recommendation and resets the canvas.
  useEffect(() => {
    setWorking(allocationFor(recommended, buckets))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [age, risk, includeHome])

  // Whole-number percentages that always sum to 100 — what the UI displays.
  const display = useMemo(() => roundTo100(working, buckets), [working, buckets])

  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [donutView, setDonutView] = useState<'target' | 'current'>('target')

  const investableUsd = current.totalUsd
  const nwTotal = netWorth(holdings, rate).totalUsd
  const hasHoldings = investableUsd > 0

  // ── Projection ────────────────────────────────────────────────────────────
  // Project from the user's ACTUAL growth once ≥3 months of net-worth history
  // is tracked; until then, fall back to a moderate 7%/yr estimate and tell the
  // user to wait. Snapshot tracking isn't wired yet, so `history` is empty today
  // → swap in the real monthly net-worth series here when it exists.
  const history: number[] = []
  const historyMonths = history.length
  const usingHistorical = historyMonths >= MIN_HISTORY_MONTHS
  // Default basis = the balance-weighted expected return of your ACTUAL accounts
  // (each grows at its own contractual/estimated rate). Falls back to the target
  // mix's blended return only when there are no holdings yet. Real net-worth
  // history overrides it once ≥3 months exist; the ± steppers nudge whichever
  // basis is active.
  const topBucket = buckets.reduce((a, b) => (display[b] > display[a] ? b : a), buckets[0])
  const baseRate = usingHistorical
    ? annualizedRate(history)
    : (portfolioExpectedReturn(holdings, rate) ?? blendedReturn(working))
  const [rateAdjust, setRateAdjust] = useState(0)
  const annualRate = Math.min(0.4, Math.max(0, baseRate + rateAdjust))

  // Let the user choose their retirement age; keep it valid as their age changes.
  const [retireAge, setRetireAge] = useState(65)
  useEffect(() => {
    setRetireAge((r) => Math.min(END_AGE, Math.max(Math.min(age + 1, END_AGE), r)))
  }, [age])
  const clampedRetire = Math.min(END_AGE, Math.max(Math.min(age + 1, END_AGE), retireAge))

  // Monthly contribution comes straight from the budget's investment categories,
  // so the projection and the budget panel are always in sync (one source of truth).
  const monthlyContribution = budgetCategories
    .filter((c) => /invest/i.test(c.label))
    .reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0)

  // Opt-in: subtract goal *costs* (education, travel — money that leaves your
  // wealth) from the curve at the year they're paid. Investment goals (property,
  // the retirement pot) convert wealth rather than spend it, so they never dip.
  const [accountForGoals, setAccountForGoals] = useState(false)
  const currentYear = new Date().getFullYear()
  const goalOutflows = useMemo(
    () =>
      goals
        .filter((g) => goalKind(g) === 'cost' && g.targetUsd > 0)
        .map((g) => ({ name: g.name, age: age + (g.targetYear - currentYear), amount: g.targetUsd }))
        .filter((o) => o.age > age && o.age <= END_AGE)
        .sort((a, b) => a.age - b.age),
    [goals, age, currentYear],
  )

  // Year-by-year cash-flow: grow the balance, add contributions, and (when the
  // toggle is on) pay each cost goal in its year. A balance that drops below 0
  // is a shortfall — we flag the age and clamp the plotted curve at 0.
  const projection = useMemo(() => {
    const raw: number[] = [investableUsd]
    let bal = investableUsd
    let shortfallAge: number | null = null
    for (let t = age + 1; t <= END_AGE; t++) {
      bal = bal * (1 + annualRate) + monthlyContribution * 12
      if (accountForGoals) {
        for (const o of goalOutflows) if (o.age === t) bal -= o.amount
      }
      if (bal < 0 && shortfallAge === null) shortfallAge = t
      raw.push(bal)
    }
    return { series: raw.map((v) => Math.max(0, v)), shortfallAge }
  }, [age, investableUsd, annualRate, monthlyContribution, accountForGoals, goalOutflows])
  const projSeries = projection.series
  const valueAtRetire = projSeries[Math.max(0, Math.min(projSeries.length - 1, clampedRetire - age))]

  // The dragged bucket holds its value; every other bucket rebalances
  // proportionally so the total is always 100 — no bucket is ever "stuck".
  function onSet(key: AllocBucket, value: number) {
    setWorking((prev) => redistribute(prev, [], key, value, buckets))
  }

  function reset() {
    setWorking(allocationFor(recommended, buckets))
  }

  const dirty = buckets.some((b) => display[b] !== recommended[b])
  const stockDrift = display.stocks - recommended.stocks
  const feedback = riskFeedback(age, risk)

  const donutData = donutView === 'current' ? currentPctMap : working

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="ai-chip relative flex size-10 items-center justify-center rounded-xl shadow-[0_2px_10px_-3px_rgba(80,120,255,0.5)]">
            <span className="absolute inset-0 rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" />
            <AnalyzerLogo size={18} />
          </span>
          <div>
            <h1 className="flex items-center gap-2 font-serif text-[1.5rem] font-medium tracking-tight">
              Portfolio Analyzer
              <span className="ai-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                AI
              </span>
            </h1>
            <p className="text-[13px] text-muted-foreground">
              An ideal split for your net worth — then make it yours
            </p>
          </div>
        </div>
        {dirty && (
          <button
            onClick={reset}
            className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium"
          >
            <RotateCcw size={14} />
            Reset to recommended
          </button>
        )}
      </div>

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <Reveal delay={0.04}>
        <Card className="grid gap-6 p-5 lg:grid-cols-[1fr_1.3fr_1fr] lg:gap-8">
          {/* Age */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Your age</span>
              <span className="tabular-nums text-lg font-semibold tabular-nums">{age}</span>
            </div>
            <input
              type="range"
              min={18}
              max={80}
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="allocation-range w-full"
              style={{ ['--accent' as string]: 'var(--brand)' }}
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>18</span>
              <span>80</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] leading-snug text-muted-foreground">
              {fromProfile ? (
                <>
                  <ShieldCheck size={12} className="shrink-0 text-success" />
                  From your profile — adjust anytime
                </>
              ) : (
                <>
                  <Info size={12} className="shrink-0" />
                  {profileAge !== null
                    ? `Your profile says ${profileAge}`
                    : 'Add your date of birth to set this automatically'}
                </>
              )}
            </p>
          </div>

          {/* Risk — 5-step slider with live feedback (Betterment-style) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Risk appetite</span>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--brand)' }}>
                {RISK_META[risk].label}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={RISK_ORDER.length - 1}
              value={RISK_ORDER.indexOf(risk)}
              onChange={(e) => setRisk(RISK_ORDER[Number(e.target.value)])}
              className="allocation-range w-full"
              style={{ ['--accent' as string]: 'var(--brand)' }}
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Cautious</span>
              <span>{RISK_META[risk].short}</span>
              <span>Aggressive</span>
            </div>
            <p
              className={cn(
                'mt-2 flex items-center gap-1.5 text-[12px] leading-snug',
                feedback.tone === 'caution' ? 'text-warning' : 'text-muted-foreground',
              )}
            >
              {feedback.tone === 'caution' ? (
                <AlertTriangle size={12} className="mt-px shrink-0" />
              ) : (
                <ShieldCheck size={12} className="mt-px shrink-0 text-success" />
              )}
              {feedback.text}
            </p>
          </div>

          {/* Include home toggle */}
          <div>
            <span className="eyebrow mb-2 block">Primary home</span>
            <button
              onClick={() => setIncludeHome((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
            >
              <span className="text-xs font-medium">
                {includeHome ? 'Included' : 'Excluded'}
                <span className="ml-1 block text-[11px] font-normal text-muted-foreground">
                  {includeHome ? 'Full net worth' : 'Investable assets only'}
                </span>
              </span>
              <span
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                  includeHome ? 'bg-foreground' : 'bg-muted-foreground/30',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
                    includeHome ? 'left-[1.125rem]' : 'left-0.5',
                  )}
                />
              </span>
            </button>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Analyzing{' '}
              <Money usd={investableUsd} className="font-medium text-foreground" /> of{' '}
              <Money usd={nwTotal} className="font-medium text-foreground" /> net worth
            </p>
          </div>
        </Card>
      </Reveal>

      {/* ── Donut + sliders ────────────────────────────────────────────── */}
      <Reveal className="grid gap-6 lg:grid-cols-5" delay={0.1}>
        {/* Donut with target/current compare toggle */}
        <Card className="flex flex-col items-center gap-4 lg:col-span-2">
          <div className="flex w-full justify-center">
            <div className="flex gap-0.5 rounded-xl border border-border/70 bg-muted/60 p-0.5">
              {(['target', 'current'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setDonutView(v)}
                  disabled={v === 'current' && !hasHoldings}
                  className={cn(
                    'rounded-[10px] px-3.5 py-1.5 text-xs font-medium transition-all duration-150 disabled:opacity-40',
                    donutView === v
                      ? 'bg-card text-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1)] ring-1 ring-border/70'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'target' ? 'Your target' : 'Current'}
                </button>
              ))}
            </div>
          </div>

          <Donut
            size={208}
            thickness={22}
            segments={buckets.map((b) => ({
              value: Math.max(donutData[b], 0.0001),
              color: BUCKET_META[b].colorVar,
            }))}
            activeIndex={activeIdx}
            onHover={setActiveIdx}
          >
            {activeIdx !== null && buckets[activeIdx] ? (
              <div key={activeIdx} className="animate-fade-in px-3">
                <p
                  className="text-[11px] font-semibold"
                  style={{ color: BUCKET_META[buckets[activeIdx]].colorVar }}
                >
                  {BUCKET_META[buckets[activeIdx]].label}
                </p>
                <p className="tabular-nums text-[2rem] font-semibold leading-tight tabular-nums">
                  {donutView === 'current'
                    ? Math.round(currentPctMap[buckets[activeIdx]])
                    : display[buckets[activeIdx]]}
                  %
                </p>
                <p className="tabular-nums text-[11px] tabular-nums text-muted-foreground">
                  <Money
                    usd={
                      ((donutView === 'current'
                        ? currentPctMap[buckets[activeIdx]]
                        : display[buckets[activeIdx]]) /
                        100) *
                      investableUsd
                    }
                  />
                </p>
              </div>
            ) : (
              <div key="total" className="animate-fade-in">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {donutView === 'current' ? 'Current' : includeHome ? 'Net worth' : 'Investable'}
                </p>
                <Money
                  usd={investableUsd}
                  className="tabular-nums text-[1.15rem] font-semibold tabular-nums"
                />
              </div>
            )}
          </Donut>

          <p className="max-w-[15rem] text-center text-[12px] leading-relaxed text-muted-foreground">
            {stockDrift === 0 ? (
              <>You&apos;re right on the recommended split for a {age}-year-old.</>
            ) : (
              <>
                Your target is{' '}
                <span className={cn('font-semibold', stockDrift > 0 ? 'text-success' : 'text-warning')}>
                  {Math.abs(stockDrift)} pts {stockDrift > 0 ? 'more aggressive' : 'more conservative'}
                </span>{' '}
                than recommended.
              </>
            )}
          </p>
        </Card>

        {/* Sliders with +/- steppers (M1-style) */}
        <Card className="lg:col-span-3">
          <CardHeader
            title="Your allocation"
            subtitle={
              donutView === 'current'
                ? 'Showing current vs target — ± from your target per asset'
                : 'Drag, or use ± — toggle Current (left) to compare to your holdings'
            }
            icon={<PieChart size={15} />}
          />
          <div className="flex flex-col gap-4">
            {buckets.map((b) => (
              <BucketSlider
                key={b}
                bucket={b}
                value={working[b]}
                displayPct={display[b]}
                recommended={recommended[b]}
                currentPct={currentPctMap[b]}
                compareCurrent={donutView === 'current' && hasHoldings}
                amountUsd={(display[b] / 100) * investableUsd}
                onChange={(v) => onSet(b, v)}
              />
            ))}
          </div>
        </Card>
      </Reveal>

      {/* ── Projection + rebalance plan ─────────────────────────────────── */}
      <Reveal className="grid gap-6 lg:grid-cols-2" delay={0.16}>
        {/* Projection — compounds the current balance to age 90, with a
            retirement marker. Switches to actual growth once ≥3 months tracked. */}
        <Card className="flex flex-col">
          <CardHeader
            title="Projected growth"
            subtitle={
              usingHistorical
                ? `From your last ${historyMonths} months of growth`
                : `Based on your target mix (${display[topBucket]}% ${BUCKET_META[topBucket].label})`
            }
            icon={<TrendingUp size={15} />}
          />
          {hasHoldings ? (
            <div className="flex flex-1 flex-col gap-4">
              {!usingHistorical && (
                <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-muted/40 px-3.5 py-2.5 text-[12px] leading-snug">
                  <Info size={13} className="mt-0.5 shrink-0 text-warning" />
                  <span className="text-muted-foreground">
                    Based on your <span className="font-medium text-foreground">target mix</span> — about{' '}
                    <span className="font-medium text-foreground">{(baseRate * 100).toFixed(1)}%/yr</span>{' '}
                    ({display[topBucket]}% {BUCKET_META[topBucket].label}). Track ~3 months to project from your{' '}
                    <span className="font-medium text-foreground">actual growth</span>; use ± to tune.
                  </span>
                </div>
              )}

              {/* Monthly income (optional) — feeds contributions + AI analysis */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="eyebrow">Monthly income</span>
                  <span className="text-[11px] text-muted-foreground">USD · optional</span>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={monthlyIncome || ''}
                    onChange={(e) => setIncome(Number(e.target.value))}
                    placeholder="e.g. 8000"
                    className="w-full rounded-xl border border-input bg-card py-2.5 pl-7 pr-3 text-sm tabular-nums shadow-[inset_0_1px_2px_hsl(var(--shadow-color)/0.04)] outline-none transition-all placeholder:text-muted-foreground/60 focus:border-brand/60 focus:ring-[3px] focus:ring-brand/12"
                  />
                </div>
                {monthlyIncome > 0 && (
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    Investing{' '}
                    <Money usd={monthlyContribution} className="tabular-nums font-medium text-foreground" />
                    /mo
                    {monthlyContribution > 0 ? (
                      <> ({Math.round((monthlyContribution / monthlyIncome) * 100)}% of income) — from your budget →</>
                    ) : (
                      <> — add an &ldquo;Investments&rdquo; line in your budget →</>
                    )}
                  </p>
                )}
              </div>

              {/* Retirement age */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="eyebrow">Retire at</span>
                  <span className="tabular-nums text-sm font-semibold">
                    {clampedRetire}
                    <span className="ml-1 font-normal text-muted-foreground">
                      · in {clampedRetire - age} yrs
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min={Math.min(age + 1, END_AGE)}
                  max={END_AGE}
                  value={clampedRetire}
                  onChange={(e) => setRetireAge(Number(e.target.value))}
                  className="allocation-range w-full"
                  style={{ ['--accent' as string]: 'var(--brand)' }}
                />
              </div>

              {/* Headline: projected value at the chosen retirement age */}
              <div>
                <p className="text-[12px] text-muted-foreground">Projected at {clampedRetire}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Money
                    usd={valueAtRetire}
                    className="tabular-nums text-[2.2rem] font-semibold leading-none tracking-tight"
                  />
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-success-muted/80 px-2 py-0.5 text-xs font-semibold text-success ring-1 ring-success/20">
                    <ArrowUpRight size={12} />
                    {(annualRate * 100).toFixed(1)}%/yr
                  </span>
                  <div className="flex items-center gap-1">
                    <Stepper
                      icon={<Minus size={11} />}
                      onClick={() => setRateAdjust((a) => Math.round((a - 0.01) * 100) / 100)}
                      disabled={annualRate <= 0}
                    />
                    <Stepper
                      icon={<Plus size={11} />}
                      onClick={() => setRateAdjust((a) => Math.round((a + 0.01) * 100) / 100)}
                      disabled={annualRate >= 0.4}
                    />
                  </div>
                </div>
              </div>

              {/* Opt-in: pay goal costs from the curve at the year they're due */}
              {goalOutflows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAccountForGoals((v) => !v)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-accent/50"
                >
                  <span className="min-w-0">
                    <span className="text-[12px] font-medium text-foreground">Account for goal costs</span>
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      subtract one-off costs the year they&apos;re due
                    </span>
                  </span>
                  <span
                    className={cn(
                      'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                      accountForGoals ? 'bg-foreground' : 'bg-muted-foreground/30',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
                        accountForGoals ? 'left-[1.125rem]' : 'left-0.5',
                      )}
                    />
                  </span>
                </button>
              )}

              {/* Trajectory: now → 90, retirement marked */}
              <ProjectionChart
                startAge={age}
                retireAge={clampedRetire}
                series={projSeries}
                format={(v) => formatAmount(v, mode, rate)}
                markers={accountForGoals ? goalOutflows.map((o) => o.age) : []}
              />

              {accountForGoals &&
                (projection.shortfallAge ? (
                  <p className="flex items-start gap-1.5 rounded-lg border border-danger/25 bg-danger-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" />
                    <span>
                      With these goal costs you&apos;d run short around{' '}
                      <span className="font-medium text-foreground">age {projection.shortfallAge}</span>. Raise
                      income or investing, push a goal out, or trim a target.
                    </span>
                  </p>
                ) : (
                  <p className="text-[11px] leading-snug text-muted-foreground/80">
                    Covers all goal costs to age {END_AGE} —{' '}
                    {goalOutflows.map((o) => `${o.name} (~${o.age})`).join(', ')}.
                  </p>
                ))}

              <p className="text-[11px] leading-snug text-muted-foreground/80">
                Compounds your current balance{monthlyContribution > 0 ? ' plus monthly contributions' : ' with no new contributions'} at{' '}
                {(annualRate * 100).toFixed(1)}%/yr to age {END_AGE}
                {accountForGoals ? ', less your goal costs' : ''}. Illustrative, not a guarantee.
              </p>
            </div>
          ) : (
            <EmptyHint />
          )}
        </Card>

        {/* Monthly budget — where the income goes, with custom categories */}
        <BudgetSection />
      </Reveal>

      {/* ── AI explanation ─────────────────────────────────────────────── */}
      <Reveal delay={0.22}>
        <AiExplainer
          age={age}
          risk={risk}
          includeRealEstate={includeHome}
          target={working}
          holdings={holdings}
          rate={rate}
          monthlyIncome={monthlyIncome}
          userId={user?.id}
        />
      </Reveal>

      <p className="px-1 text-center text-[12px] leading-relaxed text-muted-foreground/80">
        <Info size={12} className="mb-0.5 mr-1 inline" />
        Educational guidelines generated from your age and risk appetite — not personalized tax,
        legal, or financial advice. Verify with a licensed advisor before acting.
      </p>
    </div>
  )
}

/* ── Projection line chart (now → 90, with a retirement marker) ───────────── */

function ProjectionChart({
  startAge,
  retireAge,
  series,
  format,
  markers = [],
}: {
  startAge: number
  retireAge: number
  series: number[]
  format: (v: number) => string
  /** Ages at which a goal cost is paid — drawn as faint vertical dip lines. */
  markers?: number[]
}) {
  const W = 600
  const H = 168
  const padX = 6
  const padTop = 22
  const padBottom = 22
  const n = series.length
  const max = series[n - 1] || 1
  const X = (i: number) => padX + (i / Math.max(1, n - 1)) * (W - 2 * padX)
  const Y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom)
  const pts = series.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)
  const line = `M ${pts.join(' L ')}`
  const area = `${line} L ${X(n - 1).toFixed(1)},${(H - padBottom).toFixed(1)} L ${X(0).toFixed(1)},${(H - padBottom).toFixed(1)} Z`
  const rIdx = Math.max(0, Math.min(n - 1, retireAge - startAge))
  const rx = X(rIdx)
  const ry = Y(series[rIdx])

  // Hover anywhere on the chart to read the projected value at that age.
  const [hover, setHover] = useState<number | null>(null)
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))))
  }
  const hx = hover !== null ? X(hover) : 0
  const hy = hover !== null ? Y(series[hover]) : 0
  const ttAbove = hy > 52

  return (
    <div
      className="relative w-full select-none"
      style={{ height: H }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="proj-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#proj-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* goal-cost markers — where the curve dips to pay a cost goal */}
        {markers.map((mAge) => {
          const idx = mAge - startAge
          if (idx < 1 || idx > n - 1) return null
          return (
            <line
              key={mAge}
              x1={X(idx)}
              y1={padTop - 8}
              x2={X(idx)}
              y2={H - padBottom}
              stroke="var(--warning)"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.5"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
        {/* retirement marker */}
        <line
          x1={rx}
          y1={padTop - 8}
          x2={rx}
          y2={H - padBottom}
          stroke="var(--brand)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.55"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={rx} cy={ry} r="3.5" fill="var(--brand)" stroke="var(--card)" strokeWidth="1.5" />
        {/* hover marker */}
        {hover !== null && (
          <>
            <line
              x1={hx}
              y1={padTop - 8}
              x2={hx}
              y2={H - padBottom}
              stroke="var(--foreground)"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.35"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hx} cy={hy} r="3.5" fill="var(--brand)" stroke="var(--card)" strokeWidth="1.5" />
          </>
        )}
      </svg>

      {/* hover tooltip — value + age at the cursor */}
      {hover !== null && (
        <div
          className={cn('pointer-events-none absolute z-10 -translate-x-1/2', ttAbove && '-translate-y-full')}
          style={{ left: `${Math.max(9, Math.min(91, (hx / W) * 100))}%`, top: ttAbove ? hy - 6 : hy + 8 }}
        >
          <div className="whitespace-nowrap rounded-lg border border-border/70 bg-popover px-2 py-1 text-center shadow-[0_4px_12px_-2px_hsl(var(--shadow-color)/0.15)]">
            <p className="text-[11px] font-semibold tabular-nums">{format(series[hover])}</p>
            <p className="text-[9px] text-muted-foreground">age {startAge + hover}</p>
          </div>
        </div>
      )}

      {/* value at 90 — pinned top-right (hidden while hovering) */}
      {hover === null && (
        <div className="absolute right-1 top-0 rounded-md border border-border/60 bg-card/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums backdrop-blur-sm">
          {format(series[n - 1])}
          <span className="ml-1 font-normal text-muted-foreground">at 90</span>
        </div>
      )}

      {/* x-axis */}
      <div className="absolute inset-x-0 bottom-0 text-[10px] text-muted-foreground">
        <span className="absolute left-0">Now · {startAge}</span>
        <span
          className="absolute -translate-x-1/2 font-medium text-foreground"
          style={{ left: `${(rx / W) * 100}%` }}
        >
          Retire {retireAge}
        </span>
        <span className="absolute right-0">90</span>
      </div>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <TrendingUp size={18} />
      </span>
      <p className="max-w-[14rem] text-[13px] text-muted-foreground">
        Link or add accounts to project your portfolio and see your rebalancing moves.
      </p>
    </div>
  )
}

/* ── Bucket slider (drag track + ghost marker + ± steppers) ───────────────── */

function BucketSlider({
  bucket,
  value,
  displayPct,
  recommended,
  currentPct,
  compareCurrent,
  amountUsd,
  onChange,
}: {
  bucket: AllocBucket
  /** Fractional value (0–100) driving the bar fill + handle position. */
  value: number
  /** Whole-number value shown in the readout (totals 100 across buckets). */
  displayPct: number
  recommended: number
  /** What's actually held in this bucket today (percent). */
  currentPct: number
  /** When true, compare to current holdings (vs the recommended ghost). */
  compareCurrent: boolean
  amountUsd: number
  onChange: (value: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const color = BUCKET_META[bucket].colorVar

  function pctFromEvent(clientX: number): number {
    const el = trackRef.current
    if (!el) return value
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (compareCurrent) return // current comes from your accounts — read-only here
    e.preventDefault()
    trackRef.current?.setPointerCapture(e.pointerId)
    setDragging(true)
    onChange(pctFromEvent(e.clientX))
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (compareCurrent || !dragging) return
    onChange(pctFromEvent(e.clientX))
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    setDragging(false)
    trackRef.current?.releasePointerCapture(e.pointerId)
  }

  const v = Math.max(0, Math.min(100, value))
  const rounded = displayPct
  const drift = rounded - Math.round(recommended)
  const curRounded = Math.round(currentPct)
  const moveDelta = rounded - curRounded // target − current = the move to make

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[4px]" style={{ background: color }} />
          <span className="truncate font-medium">{BUCKET_META[bucket].label}</span>
          {compareCurrent ? (
            <span
              className={cn(
                'shrink-0 text-[11px] font-medium tabular-nums',
                moveDelta === 0 ? 'text-muted-foreground' : moveDelta > 0 ? 'text-success' : 'text-warning',
              )}
              title={`Now ${curRounded}% · target ${rounded}%`}
            >
              now {curRounded}%
              {moveDelta !== 0 && (
                <>
                  {' '}
                  · {moveDelta > 0 ? '+' : '−'}
                  {Math.abs(moveDelta)}
                </>
              )}
            </span>
          ) : (
            drift !== 0 && (
              <span
                className={cn(
                  'shrink-0 text-[11px] font-medium tabular-nums',
                  drift > 0 ? 'text-success' : 'text-warning',
                )}
                title={`Recommended ${Math.round(recommended)}%`}
              >
                {drift > 0 ? '+' : '−'}
                {Math.abs(drift)}
              </span>
            )
          )}
        </div>
        <div className="flex items-center gap-2 tabular-nums">
          {compareCurrent ? (
            <span className="text-[12px] text-muted-foreground">
              target <span className="font-semibold text-foreground">{rounded}%</span>
            </span>
          ) : (
            <>
              <Money usd={amountUsd} className="hidden text-[12px] text-muted-foreground sm:inline" />
              <div className="flex items-center gap-1">
                <Stepper icon={<Minus size={12} />} onClick={() => onChange(rounded - 1)} disabled={rounded <= 0} />
                <span className="w-9 text-center text-sm font-semibold">{rounded}%</span>
                <Stepper icon={<Plus size={12} />} onClick={() => onChange(rounded + 1)} disabled={rounded >= 100} />
              </div>
            </>
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={cn(
          'group relative h-6 touch-none select-none',
          compareCurrent ? 'cursor-default' : 'cursor-pointer',
        )}
      >
        <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{
              width: `${compareCurrent ? Math.max(0, Math.min(100, currentPct)) : v}%`,
              background: color,
              opacity: compareCurrent ? 0.85 : 1,
              transition: dragging ? 'none' : 'width 0.5s cubic-bezier(0.16,1,0.3,1)',
            }}
          />
        </div>
        {/* compare view: bar shows your CURRENT holding, ghost marks your TARGET.
            target view: editable bar with the recommended ghost. */}
        {compareCurrent ? (
          <span
            className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/45"
            style={{ left: `${Math.max(0, Math.min(100, rounded))}%` }}
            title={`Target: ${rounded}%`}
          />
        ) : (
          <span
            className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/35"
            style={{ left: `${Math.max(0, Math.min(100, recommended))}%` }}
            title={`Recommended: ${Math.round(recommended)}%`}
          />
        )}
        {/* draggable handle — only in the editable target view */}
        {!compareCurrent && (
          <span
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card shadow-md transition-transform group-hover:scale-110"
            style={{
              left: `${v}%`,
              borderColor: color,
              transition: dragging ? 'none' : 'left 0.5s cubic-bezier(0.16,1,0.3,1)',
            }}
          />
        )}
      </div>
    </div>
  )
}

function Stepper({
  icon,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex size-6 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {icon}
    </button>
  )
}

/* ── Monthly budget panel ─────────────────────────────────────────────────── */

function BudgetSection() {
  const { income, categories, addCategory, updateCategory, removeCategory } = useBudget()
  const { rate, mode } = useCurrency()
  const fmt = (v: number) => formatAmount(v, mode, rate)

  const spent = categories.reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0)
  const remaining = income - spent
  const denom = Math.max(income, spent, 1)

  // Focus + select the freshly-added row so the user can type a name immediately.
  const lastInputRef = useRef<HTMLInputElement>(null)
  const [addTick, setAddTick] = useState(0)
  useEffect(() => {
    if (addTick) lastInputRef.current?.select()
  }, [addTick])

  function addBlank() {
    addCategory({
      label: 'New category',
      amount: 0,
      color: BUDGET_COLORS[categories.length % BUDGET_COLORS.length],
    })
    setAddTick((t) => t + 1)
  }

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Monthly budget"
        subtitle="Where your income goes — name it, set the amount, pick a colour"
        icon={<Wallet size={15} />}
        action={
          <button
            onClick={addBlank}
            className="btn-ghost inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
          >
            <Plus size={13} />
            Add
          </button>
        }
      />

      {income <= 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Wallet size={18} />
          </span>
          <p className="max-w-[15rem] text-[13px] text-muted-foreground">
            Add your monthly income on the left, then map out where it goes.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          {/* summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="text-muted-foreground">
              Allocated <span className="font-medium tabular-nums text-foreground">{fmt(spent)}</span> of{' '}
              <span className="font-medium tabular-nums text-foreground">{fmt(income)}</span>
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ring-1',
                remaining < 0
                  ? 'bg-danger-muted/70 text-danger ring-danger/20'
                  : 'bg-success-muted/70 text-success ring-success/20',
              )}
            >
              {remaining < 0 ? `Over ${fmt(-remaining)}` : `${fmt(remaining)} left`}
            </span>
          </div>

          {/* overview stacked bar */}
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
            {categories
              .filter((c) => c.amount > 0)
              .map((c) => (
                <div
                  key={c.id}
                  style={{ width: `${(c.amount / denom) * 100}%`, background: c.color }}
                  title={`${c.label}: ${fmt(c.amount)}`}
                />
              ))}
          </div>

          {/* editable category rows */}
          <div className="-mx-1.5 mt-0.5 flex flex-col">
            {categories.map((c, i) => (
              <BudgetRow
                key={c.id}
                cat={c}
                income={income}
                inForecast={/invest/i.test(c.label)}
                inputRef={i === categories.length - 1 ? lastInputRef : undefined}
                onChange={(patch) => updateCategory(c.id, patch)}
                onRemove={() => removeCategory(c.id)}
              />
            ))}
            {categories.length === 0 && (
              <p className="py-3 text-center text-[12px] text-muted-foreground">
                No categories yet — click Add to start.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function BudgetRow({
  cat,
  income,
  inForecast,
  inputRef,
  onChange,
  onRemove,
}: {
  cat: BudgetCategory
  income: number
  inForecast: boolean
  inputRef?: React.Ref<HTMLInputElement>
  onChange: (patch: Partial<BudgetCategory>) => void
  onRemove: () => void
}) {
  const [pickColor, setPickColor] = useState(false)
  const share = income > 0 ? Math.min(1, (cat.amount > 0 ? cat.amount : 0) / income) : 0
  return (
    <div className="group rounded-lg px-1.5 py-2 transition-colors hover:bg-accent/40">
      <div className="flex items-center gap-2.5">
        {/* colour swatch + picker */}
        <div className="relative shrink-0">
          <button
            onClick={() => setPickColor((s) => !s)}
            className="size-4 rounded-[5px] ring-1 ring-border transition-transform hover:scale-110"
            style={{ background: cat.color }}
            aria-label="Change colour"
          />
          {pickColor && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickColor(false)} />
              <div className="absolute left-0 top-6 z-20 flex w-[7.5rem] flex-wrap gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-[0_8px_24px_-8px_hsl(var(--shadow-color)/0.3)]">
                {BUDGET_COLORS.map((col) => (
                  <button
                    key={col}
                    onClick={() => {
                      onChange({ color: col })
                      setPickColor(false)
                    }}
                    className="size-5 rounded-md ring-1 ring-border transition-transform hover:scale-110"
                    style={{ background: col }}
                    aria-label="Pick colour"
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          value={cat.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[13px] font-medium outline-none focus:bg-accent/60"
        />

        {inForecast && (
          <span
            className="hidden shrink-0 items-center gap-0.5 rounded-full bg-success-muted/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success ring-1 ring-success/20 sm:inline-flex"
            title="Counted as monthly investing in your projection"
          >
            <ArrowUpRight size={9} /> forecast
          </span>
        )}

        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {Math.round(share * 100)}%
        </span>

        <div className="relative shrink-0">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
            $
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={cat.amount || ''}
            onChange={(e) => onChange({ amount: Math.max(0, Number(e.target.value) || 0) })}
            placeholder="0"
            className="w-[5.5rem] rounded-md border border-border/60 bg-card py-1 pl-5 pr-2 text-right text-[12px] tabular-nums outline-none transition-colors focus:border-brand/60"
          />
        </div>

        <button
          onClick={onRemove}
          className="shrink-0 text-muted-foreground/40 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
          aria-label="Remove category"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* per-row share-of-income bar */}
      <div className="ml-[1.625rem] mt-1.5 h-1 overflow-hidden rounded-full bg-muted/70">
        <div
          className="h-full rounded-full"
          style={{
            width: `${share * 100}%`,
            background: cat.color,
            transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
          }}
        />
      </div>
    </div>
  )
}

/* ── AI explanation panel ─────────────────────────────────────────────────── */

const AI_ERROR =
  "Sorry — I couldn't reach Claude just now. Make sure **ANTHROPIC_API_KEY** is set in `.env.local`, restart the dev server, and try again."

/** Short "Jun 25" style stamp for "based on …" labels. */
function fmtStamp(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function AiExplainer({
  age,
  risk,
  includeRealEstate,
  target,
  holdings,
  rate,
  monthlyIncome,
  userId,
}: {
  age: number
  risk: RiskLevel
  includeRealEstate: boolean
  target: Allocation
  holdings: Holding[]
  rate: number
  monthlyIncome: number
  userId?: string
}) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [ts, setTs] = useState<number | null>(null)

  const cacheKey = userId ? `nriwb:analyzer-explain:${userId}` : null

  // Hydrate the last saved recommendation so returning users see it instantly,
  // without a fresh AI call — they refresh manually when their split changes.
  useEffect(() => {
    if (!cacheKey) return
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const saved = JSON.parse(raw) as { text?: string; ts?: number }
        if (saved.text) {
          setText(saved.text)
          setTs(saved.ts ?? null)
        }
      }
    } catch {
      /* ignore */
    }
  }, [cacheKey])

  async function explain() {
    if (loading) return
    setLoading(true)
    setText('')
    try {
      const res = await fetch('/api/analyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, risk, includeRealEstate, target, holdings, rate, monthlyIncome }),
      })
      if (!res.ok || !res.body) throw new Error(`Analyzer request failed (${res.status})`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        const delta = decoder.decode(value, { stream: true })
        if (delta) {
          acc += delta
          setText(acc)
        }
      }
      if (!acc) throw new Error('Empty response')
      const stamp = Date.now()
      setTs(stamp)
      if (cacheKey) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ text: acc, ts: stamp }))
        } catch {
          /* ignore */
        }
      }
    } catch {
      setText(AI_ERROR)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="ai-chip flex size-8 items-center justify-center rounded-xl shadow-[0_1px_3px_-1px_rgba(80,120,255,0.5)]">
            <Sparkles size={15} />
          </span>
          <div>
            <h2 className="font-serif text-[15px] font-medium tracking-tight">Recommendations</h2>
            <p className="text-xs text-muted-foreground">
              {ts
                ? `Based on ${fmtStamp(ts)} — refresh after changes`
                : 'Claude reviews your live split & income, then your next move'}
            </p>
          </div>
        </div>
        <button
          onClick={explain}
          disabled={loading}
          className="ai-chip inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium disabled:opacity-60"
        >
          {text && !loading ? (
            <RotateCcw size={14} className={cn(loading && 'animate-spin')} />
          ) : (
            <Sparkles size={14} className="ai-spark" />
          )}
          {loading ? 'Thinking…' : text ? 'Refresh' : 'Get recommendations'}
        </button>
      </div>

      {(text || loading) && (
        <div className="mt-4 rounded-xl border border-border bg-muted/50 px-4 py-3.5 text-sm leading-relaxed">
          {text ? (
            <Rich text={text} />
          ) : (
            <span className="text-muted-foreground">Reading your portfolio…</span>
          )}
        </div>
      )}
    </Card>
  )
}

/* Minimal rich-text: paragraphs, **bold**, • bullets (mirrors the copilot renderer). */
function Rich({ text }: { text: string }) {
  const blocks = text.split('\n').filter((l) => l.length > 0)
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((line, i) => {
        const bullet = line.trim().startsWith('•')
        const content = bullet ? line.trim().slice(1).trim() : line
        return (
          <p key={i} className={cn(bullet && 'flex gap-2 pl-1')}>
            {bullet && <span className="text-muted-foreground">•</span>}
            <span>{renderBold(content)}</span>
          </p>
        )
      })}
    </div>
  )
}

function renderBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}
