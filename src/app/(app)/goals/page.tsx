'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Target,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  TrendingUp,
  Flag,
  PiggyBank,
  GraduationCap,
  Home,
  Plane,
  ShieldCheck,
  Link2,
  Check,
  type LucideIcon,
} from 'lucide-react'
import { useCurrency } from '@/context/CurrencyContext'
import { useGoals } from '@/context/GoalsContext'
import { useProfile } from '@/context/ProfileContext'
import { useAccounts } from '@/context/AccountsContext'
import { formatAmount } from '@/lib/currency'
import { usdValue, TYPE_LABELS, type Holding } from '@/lib/portfolio'
import {
  GOAL_CATEGORY_ORDER,
  GOAL_CATEGORY_META,
  goalAccent,
  goalProgress,
  goalRemaining,
  goalMonthlyNeeded,
  goalKind,
  defaultGoalKind,
  resolveGoal,
  isGoalLinked,
  type Goal,
  type GoalCategory,
  type GoalKind,
} from '@/lib/goals'
import { Card } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { ProgressBar, RadialProgress } from '@/components/ui/charts'
import { Reveal } from '@/components/ui/Reveal'
import { cn } from '@/lib/utils'

const CATEGORY_ICON: Record<GoalCategory, LucideIcon> = {
  retirement: PiggyBank,
  education: GraduationCap,
  property: Home,
  travel: Plane,
  emergency: ShieldCheck,
  other: Flag,
}

export default function GoalsPage() {
  const { mode, rate } = useCurrency()
  const { goals, addGoal, updateGoal, removeGoal } = useGoals()
  const { age } = useProfile()
  const { holdings } = useAccounts()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [deleting, setDeleting] = useState<Goal | null>(null)

  const [currentYear, setCurrentYear] = useState(2026)
  useEffect(() => setCurrentYear(new Date().getFullYear()), [])

  // Each goal's funded amount, resolved live from linked accounts where set.
  const fundedById = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of goals) m.set(g.id, resolveGoal(g, holdings, rate).currentUsd)
    return m
  }, [goals, holdings, rate])

  // accountId → the goal it funds (for the dialog's picker + "already used" hints).
  const accountToGoal = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>()
    for (const g of goals)
      for (const id of g.linkedAccountIds ?? []) m.set(id, { id: g.id, name: g.name })
    return m
  }, [goals])

  const totals = useMemo(() => {
    const target = goals.reduce((s, g) => s + g.targetUsd, 0)
    const current = goals.reduce(
      (s, g) => s + Math.min(fundedById.get(g.id) ?? g.currentUsd, g.targetUsd),
      0,
    )
    return { target, current, pct: target > 0 ? current / target : 0 }
  }, [goals, fundedById])

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="relative flex size-10 items-center justify-center rounded-xl bg-foreground text-background shadow-[0_2px_8px_-3px_hsl(var(--shadow-color)/0.4)]">
            <span className="absolute inset-0 rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" />
            <Target size={18} />
          </span>
          <div>
            <h1 className="font-serif text-[1.5rem] font-medium tracking-tight">Goals</h1>
            <p className="text-[13px] text-muted-foreground">
              What you&apos;re building toward, across the US &amp; India
            </p>
          </div>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium"
        >
          <Plus size={14} />
          Add goal
        </button>
      </div>

      {/* ── Overall progress ───────────────────────────────────────────── */}
      {goals.length > 0 && (
        <Reveal delay={0.04}>
          <Card className="flex items-center gap-5 sm:gap-7">
            <RadialProgress value={totals.pct} color="var(--brand)" size={96} thickness={9}>
              <div>
                <span className="tabular-nums text-lg font-bold tabular-nums">
                  {Math.round(totals.pct * 100)}%
                </span>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">funded</p>
              </div>
            </RadialProgress>
            <div className="min-w-0 flex-1">
              <span className="eyebrow">Across all goals</span>
              <p className="mt-1.5 tabular-nums text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums">
                <Money usd={totals.current} /> <span className="text-muted-foreground">/</span>{' '}
                <Money usd={totals.target} className="text-muted-foreground" />
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                {goals.length} goal{goals.length > 1 ? 's' : ''} ·{' '}
                <Money usd={Math.max(0, totals.target - totals.current)} className="font-medium text-foreground" />{' '}
                still to go
              </p>
            </div>
          </Card>
        </Reveal>
      )}

      {/* ── Goal grid ──────────────────────────────────────────────────── */}
      {goals.length === 0 ? (
        <Reveal delay={0.04}>
          <Card className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Target size={22} />
            </span>
            <p className="mt-1 text-sm font-medium">No goals yet</p>
            <p className="max-w-xs text-[13px] text-muted-foreground">
              Set a target — retirement, a home in India, your child&apos;s education — and track it
              against everything you own.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="btn-primary mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium"
            >
              <Plus size={14} />
              Add your first goal
            </button>
          </Card>
        </Reveal>
      ) : (
        <Reveal delay={0.08} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              funded={fundedById.get(g.id) ?? g.currentUsd}
              mode={mode}
              rate={rate}
              currentYear={currentYear}
              age={age}
              onEdit={() => setEditing(g)}
              onDelete={() => setDeleting(g)}
            />
          ))}
        </Reveal>
      )}

      <p className="px-1 text-center text-[12px] leading-relaxed text-muted-foreground/80">
        Monthly estimates credit what you&apos;ve already saved and assume it plus your contributions
        grow ~6%/yr — a planning guide, not financial advice.
      </p>

      {adding && (
        <GoalDialog
          currentYear={currentYear}
          age={age}
          holdings={holdings}
          rate={rate}
          accountToGoal={accountToGoal}
          onClose={() => setAdding(false)}
          onSave={(g) => {
            addGoal(g)
            setAdding(false)
          }}
        />
      )}
      {editing && (
        <GoalDialog
          initial={editing}
          currentYear={currentYear}
          age={age}
          holdings={holdings}
          rate={rate}
          accountToGoal={accountToGoal}
          onClose={() => setEditing(null)}
          onSave={(g) => {
            updateGoal(editing.id, g)
            setEditing(null)
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          goal={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            removeGoal(deleting.id)
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

/* ── Goal card ─────────────────────────────────────────────────────────────── */

function GoalCard({
  goal,
  funded,
  mode,
  rate,
  currentYear,
  age,
  onEdit,
  onDelete,
}: {
  goal: Goal
  /** Funded amount resolved from linked accounts (falls back to manual). */
  funded: number
  mode: ReturnType<typeof useCurrency>['mode']
  rate: number
  currentYear: number
  age: number | null
  onEdit: () => void
  onDelete: () => void
}) {
  const accent = goalAccent(goal)
  // Compute progress/monthly off the resolved funded amount so a linked goal
  // always mirrors its real accounts.
  const rg = { ...goal, currentUsd: funded }
  const pct = goalProgress(rg)
  const Icon = CATEGORY_ICON[goal.category]
  const monthly = goalMonthlyNeeded(rg, currentYear)
  const yearsLeft = goal.targetYear - currentYear
  const reached = funded >= goal.targetUsd
  const linkedCount = goal.linkedAccountIds?.length ?? 0

  return (
    <Card hover className="group flex flex-col">
      <div className="mb-4 flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `color-mix(in oklch, ${accent} 12%, var(--card))`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${accent} 22%, transparent)`,
            color: accent,
          }}
        >
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{goal.name}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            {GOAL_CATEGORY_META[goal.category].label}
            <span
              className="rounded px-1 py-px text-[10px] font-medium capitalize"
              style={{ background: 'color-mix(in oklch, var(--foreground) 7%, transparent)' }}
              title={
                goalKind(goal) === 'cost'
                  ? 'Cost — dips your projection the year it’s paid'
                  : 'Investment — stays your wealth, no dip'
              }
            >
              {goalKind(goal)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <button
            onClick={onEdit}
            aria-label={`Edit ${goal.name}`}
            title="Edit"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete ${goal.name}`}
            title="Delete"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-muted hover:text-danger"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="mb-1.5 flex items-baseline justify-between">
        <Money
          usd={funded}
          className="tabular-nums text-[1.35rem] font-semibold leading-none tracking-tight tabular-nums"
        />
        <span className="tabular-nums text-xs font-semibold tabular-nums" style={{ color: accent }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
      <ProgressBar value={pct} color={accent} height={7} />
      <div className="mt-1.5 flex items-center justify-between text-[12px] text-muted-foreground">
        <span className="tabular-nums tabular-nums">of {formatAmount(goal.targetUsd, mode, rate)}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium">
          by {goal.targetYear}
          {age != null && goal.targetYear > currentYear
            ? ` · age ${age + (goal.targetYear - currentYear)}`
            : ''}
        </span>
      </div>

      {linkedCount > 0 && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Link2 size={11} className="shrink-0" style={{ color: accent }} />
          Funded live from {linkedCount} account{linkedCount > 1 ? 's' : ''}
        </p>
      )}

      <div className="mt-4 border-t border-border/60 pt-3 text-[12px] text-muted-foreground">
        {reached ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-success">
            <ShieldCheck size={13} /> Goal reached — nice work
          </span>
        ) : yearsLeft <= 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <Money usd={goalRemaining(goal)} className="font-medium text-foreground" /> left · target year
            passed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp size={13} className="shrink-0" />
            <span>
              ~<Money usd={monthly} className="font-medium text-foreground" />/mo for {yearsLeft} year
              {yearsLeft > 1 ? 's' : ''}
            </span>
          </span>
        )}
      </div>
    </Card>
  )
}

/* ── Add / edit goal dialog ────────────────────────────────────────────────── */

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

function GoalDialog({
  initial,
  currentYear,
  age,
  holdings,
  rate,
  accountToGoal,
  onClose,
  onSave,
}: {
  initial?: Goal
  currentYear: number
  age: number | null
  holdings: Holding[]
  rate: number
  /** accountId → the goal currently funding it (to flag/move on re-link). */
  accountToGoal: Map<string, { id: string; name: string }>
  onClose: () => void
  onSave: (g: Omit<Goal, 'id'>) => void
}) {
  const isEdit = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<GoalCategory>(initial?.category ?? 'retirement')
  const [target, setTarget] = useState(initial ? String(Math.round(initial.targetUsd)) : '')
  const [current, setCurrent] = useState(initial ? String(Math.round(initial.currentUsd)) : '')
  const [year, setYear] = useState(initial?.targetYear ?? currentYear + 10)
  const [kind, setKind] = useState<GoalKind>(
    initial?.kind ?? defaultGoalKind(initial?.category ?? 'retirement'),
  )
  const [linkedIds, setLinkedIds] = useState<string[]>(initial?.linkedAccountIds ?? [])
  useEscape(onClose)

  const linked = linkedIds.length > 0
  const linkedUsd = useMemo(
    () =>
      holdings
        .filter((h) => h.id && linkedIds.includes(h.id))
        .reduce((s, h) => s + usdValue(h, rate), 0),
    [holdings, linkedIds, rate],
  )
  function toggleAccount(id: string) {
    setLinkedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  const years = Array.from({ length: 51 }, (_, i) => currentYear + i)
  const valid = name.trim() && Number(target) > 0 && (linked || Number(current) >= 0)

  function submit() {
    if (!valid) return
    onSave({
      name: name.trim(),
      category,
      targetUsd: Number(target),
      // Linked goals snapshot the live total into currentUsd (kept in sync by
      // resolveGoal at display time); manual goals use the typed amount.
      currentUsd: linked ? Math.round(linkedUsd) : Number(current),
      targetYear: year,
      kind,
      linkedAccountIds: linked ? linkedIds : undefined,
    })
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
            <h2 className="font-serif text-base font-medium tracking-tight">
              {isEdit ? 'Edit goal' : 'Add a goal'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isEdit ? `Update “${initial.name}”` : 'Set a target and track it as your wealth grows'}
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

        <div className="flex flex-col gap-3.5">
          <Field label="Goal name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Retirement, India home"
              className={inputCls}
              autoFocus
            />
          </Field>

          <Field label="Category">
            <div className="grid grid-cols-3 gap-1.5">
              {GOAL_CATEGORY_ORDER.map((c) => {
                const Icon = CATEGORY_ICON[c]
                const active = category === c
                const accent = GOAL_CATEGORY_META[c].accent
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setCategory(c)
                      setKind(defaultGoalKind(c))
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium transition-all',
                      active
                        ? 'border-transparent text-foreground shadow-sm ring-1'
                        : 'border-border/70 text-muted-foreground hover:bg-accent/50',
                    )}
                    style={
                      active
                        ? {
                            background: `color-mix(in oklch, ${accent} 12%, var(--card))`,
                            boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${accent} 35%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <Icon size={16} style={{ color: active ? accent : undefined }} />
                    <span className="truncate">{GOAL_CATEGORY_META[c].label}</span>
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Type — affects your projection">
            <div className="grid grid-cols-2 gap-1.5">
              {(['cost', 'investment'] as GoalKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-left transition-all',
                    kind === k
                      ? 'border-transparent text-foreground shadow-sm ring-1 ring-border'
                      : 'border-border/70 text-muted-foreground hover:bg-accent/50',
                  )}
                  style={
                    kind === k
                      ? { background: 'color-mix(in oklch, var(--foreground) 5%, var(--card))' }
                      : undefined
                  }
                >
                  <span className="block text-[12px] font-medium capitalize">{k}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {k === 'cost' ? 'Spent — dips projection' : 'Stays your wealth'}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Target (USD)">
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                className={cn(inputCls, 'tabular-nums tabular-nums')}
              />
            </Field>
            <Field label={linked ? 'Saved so far — from accounts' : 'Saved so far (USD)'}>
              {linked ? (
                <div
                  className={cn(
                    inputCls,
                    'flex items-center gap-1.5 tabular-nums text-muted-foreground',
                  )}
                  title="Derived live from your linked accounts"
                >
                  <Link2 size={13} className="shrink-0" />
                  {formatAmount(linkedUsd, 'usd', rate)}
                </div>
              ) : (
                <input
                  value={current}
                  onChange={(e) => setCurrent(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="0"
                  className={cn(inputCls, 'tabular-nums tabular-nums')}
                />
              )}
            </Field>
          </div>

          <Field label="Fund from accounts (optional)">
            {holdings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-[12px] text-muted-foreground">
                No accounts yet — add some in Accounts to fund this goal automatically.
              </p>
            ) : (
              <>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border/70 p-1">
                  {holdings.map((h) => {
                    const id = h.id ?? ''
                    const on = linkedIds.includes(id)
                    const owner = accountToGoal.get(id)
                    const elsewhere = owner && owner.id !== initial?.id ? owner.name : null
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleAccount(id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                          on ? 'bg-accent/70' : 'hover:bg-accent/40',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded border',
                            on ? 'border-transparent bg-foreground text-background' : 'border-border',
                          )}
                        >
                          {on && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium">
                            {h.nickname}
                            <span className="ml-1 font-normal text-muted-foreground">
                              · {TYPE_LABELS[h.accountType] ?? h.accountType}
                            </span>
                          </span>
                          {elsewhere && (
                            <span className="block truncate text-[10.5px] text-warning">
                              moves from “{elsewhere}”
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-[12px] text-muted-foreground">
                          {formatAmount(usdValue(h, rate), 'usd', rate)}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {linked
                    ? `${linkedIds.length} account${linkedIds.length > 1 ? 's' : ''} linked — funded amount tracks them automatically.`
                    : 'Pick accounts and this goal funds itself from their live balances. Leave empty to enter a number by hand.'}
                </p>
              </>
            )}
          </Field>

          <Field label={age != null ? `Target year — you'll be ${age + (year - currentYear)}` : 'Target year'}>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={inputCls}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                  {age != null ? ` · age ${age + (y - currentYear)}` : ''}
                </option>
              ))}
            </select>
          </Field>
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
            {isEdit ? 'Save changes' : 'Add goal'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Delete confirmation ───────────────────────────────────────────────────── */

function ConfirmDeleteDialog({
  goal,
  onCancel,
  onConfirm,
}: {
  goal: Goal
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
            <h2 className="font-serif text-base font-medium tracking-tight">Delete this goal?</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{goal.name}</span> and its progress will be
              removed. This can&apos;t be undone.
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
            Delete goal
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
