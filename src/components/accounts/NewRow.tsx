'use client'

/**
 * "+ Add row": a blank account in place at the foot of the Accounts sheet.
 * Where, name, type and balance; Enter saves, Esc cancels. Checked by the same
 * rules as the quick-entry list (a name, a type, an amount above zero).
 */

import { useMemo, useRef, useState } from 'react'
import { typeChoiceLabel, typeChoicesFor, type TypeChoice } from '@/lib/account-details'
import { LINE_GROUPS, blankLine, lineToHolding, parseAmountInput, type LineGroup } from '@/lib/quick-entry'
import type { Holding } from '@/lib/portfolio'
import { TypeCell, cellCls } from '@/components/accounts/cells'
import { cn } from '@/lib/utils'

type Errors = { name?: string; type?: string; amount?: string; save?: string }

export function NewRow({
  rate,
  defaultGroup,
  onSave,
  onCancel,
}: {
  rate: number
  defaultGroup: LineGroup['key']
  /** Resolves to the saved row, or null when the save failed. */
  onSave: (h: Holding) => Promise<Holding | null>
  onCancel: () => void
}) {
  const [groupKey, setGroupKey] = useState<LineGroup['key']>(defaultGroup)
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [type, setType] = useState<TypeChoice | null>(null)
  const [amount, setAmount] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false) // a state flag can't stop two Enters in the same tick

  const group = LINE_GROUPS.find((g) => g.key === groupKey)!
  const options = useMemo(() => typeChoicesFor(group.country, group.kind), [group])
  const cur = group.country === 'US' || type === 'fcnr' ? '$' : '₹'
  const liability = group.kind === 'liability'

  const clear = (k: keyof Errors) => setErrors((e) => ({ ...e, [k]: undefined, save: undefined }))

  async function save() {
    if (inFlight.current) return
    const found: Errors = {}
    const n = parseAmountInput(amount)
    if (!name.trim()) found.name = 'Enter a name'
    if (!type) found.type = 'Choose a type'
    if (n == null) found.amount = 'Enter an amount'
    else if (Number.isNaN(n) || n <= 0) found.amount = 'Use numbers above zero, or 40L / 1.2Cr / 95k'
    if (found.name || found.type || found.amount || !type || n == null) {
      setErrors(found)
      return
    }
    inFlight.current = true
    setSaving(true)
    const line = { ...blankLine(group.country, group.kind, type, name.trim()), institution: institution.trim(), amount: n }
    const saved = await onSave(lineToHolding(line, rate))
    inFlight.current = false
    setSaving(false)
    if (!saved) setErrors({ save: 'Couldn’t save that. Check your connection and try again.' })
  }

  const Err = ({ k }: { k: keyof Errors }) =>
    errors[k] ? (
      <p role="alert" className="text-[11.5px] text-danger">
        {errors[k]}
      </p>
    ) : null

  return (
    <div
      role="group"
      aria-label="Add an account"
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 @2xl:grid-cols-5">
        <Cell label="Where" htmlFor="nr-where">
          <select
            id="nr-where"
            value={groupKey}
            onChange={(e) => {
              const next = LINE_GROUPS.find((g) => g.key === e.target.value)!
              setGroupKey(next.key)
              if (type && !typeChoicesFor(next.country, next.kind).includes(type)) setType(null)
            }}
            className={cn(cellCls, 'cursor-pointer')}
          >
            {LINE_GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </Cell>
        <Cell label="Name" htmlFor="nr-name">
          <input
            id="nr-name"
            autoFocus
            value={name}
            maxLength={120}
            placeholder={liability ? 'e.g. Chase Mortgage' : 'e.g. Chase Checking'}
            aria-invalid={!!errors.name || undefined}
            onChange={(e) => {
              setName(e.target.value)
              clear('name')
            }}
            className={cn(cellCls, errors.name && 'border-danger')}
          />
          <Err k="name" />
        </Cell>
        <Cell label={liability ? 'Lender' : 'Institution'} htmlFor="nr-institution">
          <input
            id="nr-institution"
            value={institution}
            maxLength={120}
            placeholder="e.g. Chase"
            onChange={(e) => setInstitution(e.target.value)}
            className={cellCls}
          />
        </Cell>
        <Cell label="Type" htmlFor="nr-type">
          <TypeCell
            id="nr-type"
            value={type}
            options={options}
            label="Account type"
            onChange={(t) => {
              setType(t)
              clear('type')
            }}
          />
          <Err k="type" />
        </Cell>
        <Cell label={`${liability ? 'Amount owed' : 'Balance'} (${cur})`} htmlFor="nr-amount">
          <input
            id="nr-amount"
            value={amount}
            inputMode="decimal"
            placeholder={cur === '$' ? 'e.g. 95k' : 'e.g. 40L'}
            aria-invalid={!!errors.amount || undefined}
            onChange={(e) => {
              setAmount(e.target.value)
              clear('amount')
            }}
            className={cn(cellCls, 'text-right tabular-nums', errors.amount && 'border-danger')}
          />
          <Err k="amount" />
        </Cell>
      </div>
      {errors.save && (
        <p role="alert" className="text-[12.5px] text-danger">
          {errors.save}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted-foreground">
          Enter to save · Esc to cancel
          {type ? ` · ${typeChoiceLabel(type)}` : ''}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost ml-auto rounded-xl border border-border/70 px-3.5 py-2 text-[13px] font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary rounded-xl px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
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
