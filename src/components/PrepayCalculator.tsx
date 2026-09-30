'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, X } from 'lucide-react'
import { Money } from '@/components/ui/Money'
import { formatLakhs, formatUSD } from '@/lib/currency'
import { comparePrepay } from '@/lib/prepay'
import { loanBalanceNative, loanCurrency, payoffMonths, type LoanCurrency } from '@/lib/debt-goal'
import { portfolioExpectedReturn } from '@/lib/allocation'
import type { Holding } from '@/lib/portfolio'
import { cn } from '@/lib/utils'

const inputCls =
  'h-9 w-full rounded-xl border border-input bg-card px-3 text-[13px] tabular-nums outline-none transition-all focus:border-brand/60 focus:ring-[3px] focus:ring-brand/12'

const fmt = (n: number, c: LoanCurrency) => (c === 'INR' ? formatLakhs(Math.round(n)) : formatUSD(n))

function payoffLabel(months: number | null) {
  if (months == null) return 'Not paid off'
  if (months === 0) return 'Paid off now'
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return `${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} (${Math.floor(months / 12)}y ${months % 12}m)`
}

/**
 * Prepay the loan or invest the money? Everything recalculates in the browser as
 * the inputs change. Explains the trade-off; never recommends an option.
 */
export function PrepayCalculator({
  loan,
  holdings,
  rate,
  onClose,
  onEditLoan,
}: {
  loan: Holding
  holdings: Holding[]
  rate: number
  onClose: () => void
  /** Opens the loan's edit dialog (to add a missing rate or payment). */
  onEditLoan: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const currency = loanCurrency(loan)
  const balance = loanBalanceNative(loan)
  const apr = loan.details?.interestRate
  const payment = loan.details?.minPayment
  const remaining = apr != null && payment ? payoffMonths(balance, apr, payment) : Infinity

  const [extra, setExtra] = useState(currency === 'INR' ? '500000' : '10000')
  const [mode, setMode] = useState<'lump' | 'monthly'>('lump')
  const [years, setYears] = useState(() =>
    String(Number.isFinite(remaining) && remaining > 0 ? Math.min(40, Math.ceil(remaining / 12)) : 10),
  )
  const defaultReturn = portfolioExpectedReturn(holdings, rate) ?? 0.07
  const [ret, setRet] = useState((defaultReturn * 100).toFixed(1))
  const [move, setMove] = useState(0) // percent, + = rupee stronger

  const result = useMemo(() => {
    if (apr == null || !payment) return null
    return comparePrepay({
      balance,
      aprPct: apr,
      payment,
      extra: Number(extra) || 0,
      extraMode: mode,
      horizonMonths: Math.max(1, Math.round((Number(years) || 1) * 12)),
      investReturn: (Number(ret) || 0) / 100,
      currency,
      rate,
      rupeeMove: currency === 'INR' ? move / 100 : 0,
    })
  }, [apr, payment, balance, extra, mode, years, ret, currency, rate, move])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prepay-title"
        className="card-surface relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-6">
          <div>
            <h2 id="prepay-title" className="flex items-center gap-2 font-serif text-base font-medium tracking-tight">
              <Calculator size={16} className="text-muted-foreground" />
              Prepay {loan.nickname}, or invest?
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fmt(balance, currency)} owed{apr != null ? ` at ${apr}%` : ''}
              {payment ? ` · ${fmt(payment, currency)}/mo` : ''}
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

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
          {!result ? (
            <div className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-center text-[13px] text-muted-foreground">
              This needs the loan&apos;s interest rate and monthly payment.{' '}
              <button onClick={onEditLoan} className="font-medium text-foreground underline-offset-2 hover:underline">
                Add them
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-[11.5px] font-medium text-muted-foreground">Extra money ({currency})</span>
                  <div className="flex gap-1.5">
                    <input
                      value={extra}
                      onChange={(e) => setExtra(e.target.value.replace(/[^0-9.]/g, ''))}
                      inputMode="decimal"
                      className={inputCls}
                    />
                    <div className="flex shrink-0 rounded-xl bg-muted/60 p-0.5">
                      {(['lump', 'monthly'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setMode(m)}
                          aria-pressed={mode === m}
                          className={cn(
                            'rounded-[10px] px-2.5 text-[12px] font-medium',
                            mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground',
                          )}
                        >
                          {m === 'lump' ? 'Once' : '/mo'}
                        </button>
                      ))}
                    </div>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11.5px] font-medium text-muted-foreground">Horizon (years)</span>
                  <input
                    value={years}
                    onChange={(e) => setYears(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11.5px] font-medium text-muted-foreground">Investment return (%/yr)</span>
                  <input
                    value={ret}
                    onChange={(e) => setRet(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    className={inputCls}
                  />
                </label>
              </div>

              {currency === 'INR' && (
                <label className="flex flex-col gap-1.5">
                  <span className="flex justify-between text-[11.5px] font-medium text-muted-foreground">
                    <span>What if the rupee moves by the horizon?</span>
                    <span className="tabular-nums text-foreground">
                      {move === 0 ? 'No change' : `Rupee ${Math.abs(move)}% ${move > 0 ? 'stronger' : 'weaker'}`}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={1}
                    value={move}
                    onChange={(e) => setMove(Number(e.target.value))}
                    aria-label="Rupee move by the horizon, percent"
                    className="accent-[var(--brand)]"
                  />
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['prepay', 'Prepay the loan', 'Guaranteed: saves the loan rate'],
                    ['invest', 'Invest instead', 'Expected, not guaranteed'],
                  ] as const
                ).map(([key, title, tag]) => {
                  const s = result[key]
                  return (
                    <div key={key} className="rounded-xl border border-border/70 p-4">
                      <p className="text-[13px] font-semibold">{title}</p>
                      <p className="text-[11px] text-muted-foreground">{tag}</p>
                      <dl className="mt-3 flex flex-col gap-2 text-[12.5px]">
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Net position at horizon</dt>
                          <dd>
                            <Money usd={s.endNetUsd} className="tabular-nums font-semibold" />
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Interest paid (life of loan)</dt>
                          <dd className="tabular-nums font-medium">{fmt(s.lifetimeInterest, currency)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">Loan paid off</dt>
                          <dd className="text-right tabular-nums font-medium">{payoffLabel(s.payoffMonths)}</dd>
                        </div>
                      </dl>
                    </div>
                  )
                })}
              </div>

              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Prepaying avoids <span className="font-medium text-foreground">{fmt(result.interestSaved, currency)}</span> of
                interest
                {result.monthsSaved != null && result.monthsSaved > 0
                  ? ` and ends the loan ${Math.floor(result.monthsSaved / 12)}y ${result.monthsSaved % 12}m sooner`
                  : ''}
                . Investing keeps the money working at an expected {ret}%/yr, which can come in higher or lower. The
                difference in net position is{' '}
                <Money usd={Math.abs(result.invest.endNetUsd - result.prepay.endNetUsd)} className="font-medium text-foreground" />
                {' '}in favour of {result.invest.endNetUsd >= result.prepay.endNetUsd ? 'investing' : 'prepaying'} under these
                assumptions.
              </p>

              <details className="rounded-xl bg-muted/40 px-4 py-3 text-[12px] text-muted-foreground" open>
                <summary className="cursor-pointer font-medium text-foreground">Assumptions</summary>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>
                    Loan: {fmt(balance, currency)} at {apr}% with {fmt(payment!, currency)}/mo, compounding monthly.
                  </li>
                  <li>
                    {mode === 'lump' ? 'A one-time' : 'A monthly'} extra of {fmt(Number(extra) || 0, currency)} in both
                    scenarios; once the loan is paid off, the freed payment is invested at {ret}%/yr in both.
                  </li>
                  <li>Horizon: {years} years. Net position = investments − loan left at the horizon.</li>
                  {currency === 'INR' && (
                    <li>
                      Investments are dollar assets valued at today&apos;s ₹{rate.toFixed(2)}; the loan left at the horizon
                      is valued at ₹{(rate / (1 + move / 100)).toFixed(2)} per dollar.
                    </li>
                  )}
                  <li>Pre-tax only. The after-tax view (mortgage interest deduction, Section 24/80C) comes later.</li>
                </ul>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
