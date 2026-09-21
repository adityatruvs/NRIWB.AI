'use client'

import { useEffect, useRef, useState } from 'react'
import { Wallet, Plus, Trash2, ArrowUpRight, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useCurrency } from '@/context/CurrencyContext'
import { useBudget, BUDGET_COLORS, type BudgetCategory } from '@/context/BudgetContext'
import { formatAmount } from '@/lib/currency'
import { Card, CardHeader } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { Reveal } from '@/components/ui/Reveal'
import { cn } from '@/lib/utils'

export default function BudgetPage() {
  const { income, setIncome, categories, addCategory, updateCategory, removeCategory } = useBudget()
  const { rate, mode } = useCurrency()
  const fmt = (v: number) => formatAmount(v, mode, rate)

  const spent = categories.reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0)
  const remaining = income - spent
  const denom = Math.max(income, spent, 1)

  // Monthly investing — the categories tagged "invest" feed the analyzer's
  // projection, so we surface the same number here (one source of truth).
  const investing = categories
    .filter((c) => /invest/i.test(c.label))
    .reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0)

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
    <div className="flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="relative flex size-10 items-center justify-center rounded-xl bg-foreground text-background shadow-[0_2px_8px_-3px_hsl(var(--shadow-color)/0.4)]">
            <span className="absolute inset-0 rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" />
            <Wallet size={18} />
          </span>
          <div>
            <h1 className="font-serif text-[1.5rem] font-medium tracking-tight">Monthly budget</h1>
            <p className="text-[13px] text-muted-foreground">
              Map where your income goes — your investing line feeds the Analyzer
            </p>
          </div>
        </div>
      </div>

      {/* ── Income ───────────────────────────────────────────────────────── */}
      <Reveal delay={0.04}>
        <Card className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="eyebrow">Monthly income</span>
              <span className="text-[11px] text-muted-foreground">USD</span>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={income || ''}
                onChange={(e) => setIncome(Number(e.target.value))}
                placeholder="e.g. 8000"
                className="w-full rounded-xl border border-input bg-card py-2.5 pl-7 pr-3 text-sm tabular-nums shadow-[inset_0_1px_2px_hsl(var(--shadow-color)/0.04)] outline-none transition-all placeholder:text-muted-foreground/60 focus:border-brand/60 focus:ring-[3px] focus:ring-brand/12"
              />
            </div>
          </div>

          {income > 0 && (
            <Link
              href="/analyzer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 px-3.5 py-2.5 transition-colors hover:bg-accent/50 sm:min-w-[15rem]"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-success-muted/70 text-success">
                  <TrendingUp size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-foreground">
                    Investing <Money usd={investing} className="tabular-nums" />/mo
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {investing > 0
                      ? `${Math.round((investing / income) * 100)}% of income · feeds projection`
                      : 'Add an “Investments” line below'}
                  </span>
                </span>
              </span>
              <ArrowUpRight
                size={15}
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
          )}
        </Card>
      </Reveal>

      {/* ── Breakdown ────────────────────────────────────────────────────── */}
      <Reveal delay={0.1}>
        <Card className="flex flex-col">
          <CardHeader
            title="Where it goes"
            subtitle="Name a category, set the amount, pick a colour"
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
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Wallet size={18} />
              </span>
              <p className="max-w-[15rem] text-[13px] text-muted-foreground">
                Add your monthly income above, then map out where it goes.
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
      </Reveal>
    </div>
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
