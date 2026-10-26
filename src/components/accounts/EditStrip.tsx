'use client'

/**
 * The strip that opens under a row when its pencil is pressed: name, type,
 * balance, rate, maturity or monthly payment, and whose name. Enter saves, Esc
 * cancels, and a field with a problem says so instead of saving.
 */

import { useMemo, useRef, useState } from 'react'
import { entryCurrency, fromTypeChoice, typeChoicesFor } from '@/lib/account-details'
import { RELATION_LABELS, isLiability, type Holding, type OwnerRelation, type Ownership } from '@/lib/portfolio'
import {
  applyStrip,
  changeStripType,
  draftFromHolding,
  stripSpec,
  validateStrip,
  type StripDraft,
  type StripErrors,
} from '@/lib/edit-strip'
import { TypeCell, cellCls } from '@/components/accounts/cells'
import { cn } from '@/lib/utils'

const OWNERSHIP: { value: Ownership; label: string }[] = [
  { value: 'self', label: 'Just me' },
  { value: 'joint', label: 'Joint' },
  { value: 'family', label: 'Family member' },
]
const RELATIONS = Object.keys(RELATION_LABELS) as OwnerRelation[]

export function EditStrip({
  holding: a,
  rate,
  onSave,
  onCancel,
  onAllDetails,
}: {
  holding: Holding
  rate: number
  /** Resolves to false when the save failed (the account is already back as it was). */
  onSave: (next: Holding) => Promise<boolean>
  onCancel: () => void
  /** Rates and ownership are here; loan links and the rest are in the full form. */
  onAllDetails: () => void
}) {
  const liability = isLiability(a)
  const [draft, setDraft] = useState<StripDraft>(() => draftFromHolding(a, rate))
  const [errors, setErrors] = useState<StripErrors>({})
  const done = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // What the account looked like when the strip opened, to notice a balance that moved meanwhile.
  const opened = useRef(a)
  const openedAmount = useRef(draft.amount)
  const [conflict, setConflict] = useState(false)

  const spec = stripSpec(a, draft.choice)
  const cur = entryCurrency(a.country, fromTypeChoice(draft.choice).accountType)
  const linked = a.source !== 'manual'
  const options = useMemo(() => {
    const list = typeChoicesFor(a.country, liability ? 'liability' : 'asset')
    return list.includes(draft.choice) ? list : [draft.choice, ...list]
  }, [a.country, liability, draft.choice])

  const set = (patch: Partial<StripDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k as keyof StripDraft]
      return next
    })
  }

  async function save(overwrite = false) {
    if (done.current) return
    let d = draft
    const moved = a.balanceUsd !== opened.current.balanceUsd || a.balanceInr !== opened.current.balanceInr
    if (moved && a.source === 'manual') {
      if (d.amount === openedAmount.current) {
        // The balance wasn't touched here: keep the newer one rather than putting the old one back.
        d = { ...d, amount: draftFromHolding(a, rate).amount }
      } else if (!overwrite) {
        setConflict(true)
        return
      }
    }
    const found = validateStrip(a, d)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      setConflict(false)
      return
    }
    done.current = true
    setSaving(true)
    setSaveError(null)
    setConflict(false)
    const ok = await onSave(applyStrip(a, d, rate))
    if (!ok) {
      // Still mounted only when it failed: keep what was typed and say so.
      done.current = false
      setSaving(false)
      setSaveError('Couldn’t save that. The account is back as it was. Check your connection and try again.')
    }
  }

  const Err = ({ field }: { field: keyof StripDraft }) =>
    errors[field] ? (
      <p role="alert" className="text-[11.5px] text-danger">
        {errors[field]}
      </p>
    ) : null

  return (
    <div
      role="group"
      aria-label={`Edit ${a.nickname}`}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault()
          void save()
        }
      }}
      className="flex flex-col gap-3 border-t border-brand/25 bg-brand/[0.04] px-4 py-3.5 animate-fade-in"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 @2xl:grid-cols-4">
        <Cell label="Name" htmlFor={`es-name-${a.id}`}>
          <input
            id={`es-name-${a.id}`}
            autoFocus
            value={draft.name}
            maxLength={120}
            aria-invalid={!!errors.name || undefined}
            onChange={(e) => set({ name: e.target.value })}
            className={cn(cellCls, errors.name && 'border-danger')}
          />
          <Err field="name" />
        </Cell>
        <Cell label="Type" htmlFor={`es-type-${a.id}`}>
          <TypeCell
            id={`es-type-${a.id}`}
            value={draft.choice}
            options={options}
            label="Account type"
            onChange={(t) => t && setDraft((d) => changeStripType(a, d, t, rate))}
          />
        </Cell>
        <Cell label={`${liability ? 'Amount owed' : 'Balance'} (${cur === 'USD' ? '$' : '₹'})`} htmlFor={`es-amount-${a.id}`}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted-foreground">
              {cur === 'USD' ? '$' : '₹'}
            </span>
            <input
              id={`es-amount-${a.id}`}
              value={draft.amount}
              inputMode="decimal"
              readOnly={linked}
              title={linked ? 'Synced from your bank — it refreshes on its own' : undefined}
              aria-invalid={!!errors.amount || undefined}
              placeholder={cur === 'USD' ? 'e.g. 95k' : 'e.g. 40L'}
              onChange={(e) => set({ amount: e.target.value })}
              className={cn(
                cellCls,
                'pl-7 text-right tabular-nums',
                errors.amount && 'border-danger',
                linked && 'cursor-default bg-muted/40',
              )}
            />
          </div>
          <Err field="amount" />
        </Cell>
        {spec.interestRate && (
          <Cell label={liability ? 'APR %' : 'Rate %'} htmlFor={`es-rate-${a.id}`}>
            <input
              id={`es-rate-${a.id}`}
              value={draft.rate}
              inputMode="decimal"
              aria-invalid={!!errors.rate || undefined}
              placeholder="e.g. 7.1"
              onChange={(e) => set({ rate: e.target.value })}
              className={cn(cellCls, 'tabular-nums', errors.rate && 'border-danger')}
            />
            <Err field="rate" />
          </Cell>
        )}
        {spec.maturityDate && (
          <Cell label={liability ? 'Payoff' : 'Maturity'} htmlFor={`es-maturity-${a.id}`}>
            <input
              id={`es-maturity-${a.id}`}
              type="date"
              value={draft.maturity}
              aria-invalid={!!errors.maturity || undefined}
              onChange={(e) => set({ maturity: e.target.value })}
              className={cn(cellCls, 'tabular-nums', errors.maturity && 'border-danger')}
            />
            <Err field="maturity" />
          </Cell>
        )}
        {spec.minPayment && (
          <Cell label={`Monthly payment (${cur})`} htmlFor={`es-payment-${a.id}`}>
            <input
              id={`es-payment-${a.id}`}
              value={draft.payment}
              inputMode="decimal"
              aria-invalid={!!errors.payment || undefined}
              placeholder="e.g. 70k"
              onChange={(e) => set({ payment: e.target.value })}
              className={cn(cellCls, 'tabular-nums', errors.payment && 'border-danger')}
            />
            <Err field="payment" />
          </Cell>
        )}
        <Cell label="Whose name" htmlFor={`es-owner-${a.id}`}>
          <select
            id={`es-owner-${a.id}`}
            value={draft.ownership}
            onChange={(e) => set({ ownership: e.target.value as Ownership })}
            className={cn(cellCls, 'cursor-pointer')}
          >
            {OWNERSHIP.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Cell>
        {draft.ownership !== 'self' && (
          <Cell label={draft.ownership === 'joint' ? 'Held jointly with' : 'Held in the name of'} htmlFor={`es-person-${a.id}`}>
            <div className="flex gap-2">
              <select
                aria-label="Relation"
                value={draft.relation}
                onChange={(e) => set({ relation: e.target.value as OwnerRelation })}
                className={cn(cellCls, 'w-32 shrink-0 cursor-pointer')}
              >
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {RELATION_LABELS[r]}
                  </option>
                ))}
              </select>
              <input
                id={`es-person-${a.id}`}
                value={draft.person}
                maxLength={80}
                placeholder="Name (optional)"
                onChange={(e) => set({ person: e.target.value })}
                className={cellCls}
              />
            </div>
          </Cell>
        )}
      </div>

      {saveError && (
        <p role="alert" className="text-[12.5px] text-danger">
          {saveError}
        </p>
      )}
      {conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-warning-muted/60 px-3 py-2 text-[12.5px] text-warning">
          <span className="min-w-0 flex-1">
            This balance changed to {draftFromHolding(a, rate).amount} since you opened this. Save your{' '}
            {draft.amount} anyway?
          </span>
          <button type="button" onClick={() => void save(true)} className="font-semibold underline underline-offset-2">
            Save anyway
          </button>
          <button type="button" onClick={() => setConflict(false)} className="font-semibold underline underline-offset-2">
            Keep editing
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted-foreground">Enter to save · Esc to cancel</span>
        <button
          type="button"
          onClick={onAllDetails}
          className="text-[12px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          All details
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost ml-auto inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3.5 py-2 text-[13px] font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function Cell({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
