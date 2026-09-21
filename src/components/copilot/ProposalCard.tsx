'use client'

/**
 * An inline, editable card for a copilot-proposed change. The user can tweak any
 * field, then Accept (applies via the shared contexts) or Discard. Add and edit
 * are unified: an "edit" proposal is resolved to a full editable entity up front,
 * so this card only ever deals with complete, applicable data.
 */

import { Check, X, Wallet, Target, Banknote, Pencil, type LucideIcon } from 'lucide-react'
import { TYPE_LABELS, type Holding, type HoldingDetails } from '@/lib/portfolio'
import { detailSpec } from '@/lib/account-details'
import {
  GOAL_CATEGORY_ORDER,
  GOAL_CATEGORY_META,
  defaultGoalKind,
  type Goal,
  type GoalCategory,
  type GoalKind,
} from '@/lib/goals'
import type { AccountType } from '@/types/accounts'
import type { RawProposal, RawAccount, RawGoal } from '@/lib/copilot-actions'
import type { BudgetCategory } from '@/context/BudgetContext'
import { cn } from '@/lib/utils'

export interface AccountFields {
  nickname: string
  institution: string
  accountType: AccountType
  country: 'US' | 'IN'
  /** Balance in the country's own currency (USD for US, INR for IN). */
  balance: number
  kind: 'asset' | 'liability'
  isPfic: boolean
  // Instrument-specific details — the card shows only the ones that fit the type.
  interestRate?: number
  expectedReturn?: number
  maturityDate?: string
  compounding?: NonNullable<HoldingDetails['compounding']>
  depositCurrency?: NonNullable<HoldingDetails['depositCurrency']>
  tdsRate?: number
  fdScheme?: 'NRE' | 'NRO'
  isSgb?: boolean
  minPayment?: number
}

export interface GoalFields {
  name: string
  category: GoalCategory
  targetUsd: number
  currentUsd: number
  targetYear: number
  kind: GoalKind
}

/** A proposal resolved to fully-editable, directly-applicable data. */
export type EditableProposal =
  | { type: 'add_account' | 'update_account'; id?: string; summary: string; account: AccountFields }
  | { type: 'add_goal' | 'update_goal'; id?: string; summary: string; goal: GoalFields }
  | { type: 'set_income'; summary: string; amount: number }
  | { type: 'add_category'; summary: string; label: string; amount: number }
  | { type: 'update_category'; id: string; summary: string; label: string; amount: number }

export type ProposalStatus = 'pending' | 'applied' | 'discarded'

const ACCOUNT_TYPE_OPTIONS: AccountType[] = [
  'checking', 'savings', 'brokerage', '401k', 'ira', 'roth_ira', 'real_estate', 'property',
  'nre', 'nro', 'fcnr', 'fd', 'mutual_fund', 'gold', 'vehicle', 'cd', 'bond', 'notes_receivable',
  'other', 'mortgage', 'home_loan', 'heloc', 'auto_loan', 'student_loan', 'education_loan',
  'personal_loan', 'credit_card', 'notes_payable', 'other_debt',
]

const META: Record<EditableProposal['type'], { icon: LucideIcon; verb: string }> = {
  add_account: { icon: Wallet, verb: 'Add account' },
  update_account: { icon: Pencil, verb: 'Edit account' },
  add_goal: { icon: Target, verb: 'Add goal' },
  update_goal: { icon: Pencil, verb: 'Edit goal' },
  set_income: { icon: Banknote, verb: 'Set income' },
  add_category: { icon: Wallet, verb: 'Add budget line' },
  update_category: { icon: Pencil, verb: 'Edit budget line' },
}

/** Build a full editable entity from a model proposal + the user's current data. */
export function resolveProposal(
  raw: RawProposal,
  ctx: { holdings: Holding[]; goals: Goal[]; categories: BudgetCategory[]; currentYear: number },
): EditableProposal | null {
  const summary = raw.summary?.trim() || ''
  switch (raw.type) {
    case 'add_account':
      return { type: 'add_account', summary, account: accountFromRaw(raw.account) }
    case 'update_account': {
      const h = ctx.holdings.find((x) => x.id === raw.id)
      if (!h) return null
      const base = accountFromHolding(h)
      return { type: 'update_account', id: h.id, summary, account: accountFromRaw(raw.account, base) }
    }
    case 'add_goal':
      return { type: 'add_goal', summary, goal: goalFromRaw(raw.goal, ctx.currentYear) }
    case 'update_goal': {
      const g = ctx.goals.find((x) => x.id === raw.id)
      if (!g) return null
      const base = goalFromGoal(g)
      return { type: 'update_goal', id: g.id, summary, goal: goalFromRaw(raw.goal, ctx.currentYear, base) }
    }
    case 'set_income':
      return { type: 'set_income', summary, amount: Math.max(0, Math.round(Number(raw.amount) || 0)) }
    case 'add_category':
      return { type: 'add_category', summary, label: raw.label?.trim() || '', amount: Math.max(0, Math.round(Number(raw.amount) || 0)) }
    case 'update_category': {
      const c = ctx.categories.find((x) => x.id === raw.id)
      if (!c) return null
      return {
        type: 'update_category',
        id: c.id,
        summary,
        label: (raw.label ?? c.label).trim() || c.label,
        amount: Math.max(0, Math.round(raw.amount != null ? Number(raw.amount) : c.amount)),
      }
    }
    default:
      return null
  }
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function accountFromRaw(a: RawAccount | undefined, base?: AccountFields): AccountFields {
  const r = a ?? {}
  return {
    nickname: r.nickname ?? base?.nickname ?? '',
    institution: r.institution ?? base?.institution ?? '',
    accountType: r.accountType ?? base?.accountType ?? 'savings',
    country: r.country ?? base?.country ?? 'US',
    balance: Math.max(0, Math.round(Number(r.balance ?? base?.balance ?? 0)) || 0),
    kind: r.kind ?? base?.kind ?? 'asset',
    isPfic: r.isPfic ?? base?.isPfic ?? false,
    interestRate: num(r.interestRate) ?? base?.interestRate,
    expectedReturn: num(r.expectedReturn) ?? base?.expectedReturn,
    maturityDate: r.maturityDate ?? base?.maturityDate,
    compounding: r.compounding ?? base?.compounding,
    depositCurrency: r.depositCurrency ?? base?.depositCurrency,
    tdsRate: num(r.tdsRate) ?? base?.tdsRate,
    fdScheme: r.fdScheme ?? base?.fdScheme,
    isSgb: r.isSgb ?? base?.isSgb,
    minPayment: num(r.minPayment) ?? base?.minPayment,
  }
}

function accountFromHolding(h: Holding): AccountFields {
  const d = h.details
  return {
    nickname: h.nickname,
    institution: h.institution,
    accountType: h.accountType,
    country: h.country,
    balance: Math.round(h.country === 'IN' ? h.balanceInr : h.balanceUsd),
    kind: h.kind === 'liability' ? 'liability' : 'asset',
    isPfic: h.isPfic,
    interestRate: d?.interestRate,
    expectedReturn: d?.expectedReturn,
    maturityDate: d?.maturityDate,
    compounding: d?.compounding,
    depositCurrency: d?.depositCurrency,
    tdsRate: d?.tdsRate,
    fdScheme: d?.fdScheme,
    isSgb: d?.isSgb,
    minPayment: d?.minPayment,
  }
}

function goalFromRaw(g: RawGoal | undefined, currentYear: number, base?: GoalFields): GoalFields {
  const r = g ?? {}
  const category = r.category ?? base?.category ?? 'other'
  return {
    name: r.name ?? base?.name ?? '',
    category,
    targetUsd: Math.max(0, Math.round(Number(r.targetUsd ?? base?.targetUsd ?? 0)) || 0),
    currentUsd: Math.max(0, Math.round(Number(r.currentUsd ?? base?.currentUsd ?? 0)) || 0),
    targetYear: Math.round(Number(r.targetYear ?? base?.targetYear ?? currentYear + 10)) || currentYear + 10,
    kind: r.kind ?? base?.kind ?? defaultGoalKind(category),
  }
}

function goalFromGoal(g: Goal): GoalFields {
  return {
    name: g.name,
    category: g.category,
    targetUsd: Math.round(g.targetUsd),
    currentUsd: Math.round(g.currentUsd),
    targetYear: g.targetYear,
    kind: g.kind ?? defaultGoalKind(g.category),
  }
}

/* ── Converters used on Accept ────────────────────────────────────────────── */

/** Collect only the detail fields that apply to this account type and are set. */
function buildDetails(a: AccountFields): HoldingDetails | undefined {
  const spec = detailSpec(a.country, a.accountType, a.isSgb ?? false, a.fdScheme ?? 'NRE')
  const d: HoldingDetails = {}
  if (spec.interestRate && a.interestRate != null) d.interestRate = a.interestRate
  if (spec.expectedReturn && a.expectedReturn != null) d.expectedReturn = a.expectedReturn
  if (spec.maturityDate && a.maturityDate) d.maturityDate = a.maturityDate
  if (spec.compounding) d.compounding = a.compounding ?? 'quarterly'
  if (spec.depositCurrency) d.depositCurrency = a.depositCurrency ?? 'USD'
  if (spec.schemeToggle) d.fdScheme = a.fdScheme ?? 'NRE'
  if (spec.tdsRate && a.tdsRate != null) d.tdsRate = a.tdsRate
  if (spec.minPayment && a.minPayment != null) d.minPayment = a.minPayment
  if (spec.goldToggle && a.isSgb) d.isSgb = true
  return Object.keys(d).length ? d : undefined
}

export function accountToHolding(a: AccountFields): Omit<Holding, 'id'> {
  return {
    nickname: a.nickname.trim(),
    institution: a.institution.trim(),
    accountType: a.accountType,
    country: a.country,
    balanceUsd: a.country === 'US' ? a.balance : 0,
    balanceInr: a.country === 'IN' ? a.balance : 0,
    // Mirror the dialog: an India mutual fund is a PFIC.
    isPfic: a.kind !== 'liability' && a.country === 'IN' && a.accountType === 'mutual_fund' ? true : a.isPfic,
    source: 'manual',
    kind: a.kind,
    details: buildDetails(a),
  }
}

export function goalToGoal(g: GoalFields): Omit<Goal, 'id'> {
  return {
    name: g.name.trim(),
    category: g.category,
    targetUsd: g.targetUsd,
    currentUsd: g.currentUsd,
    targetYear: g.targetYear,
    kind: g.kind,
  }
}

/** Whether a proposal has the minimum it needs to be applied. */
export function canApply(p: EditableProposal): boolean {
  switch (p.type) {
    case 'add_account':
    case 'update_account':
      return !!p.account.nickname.trim() && !!p.account.institution.trim()
    case 'add_goal':
    case 'update_goal':
      return !!p.goal.name.trim() && p.goal.targetUsd > 0 && p.goal.targetYear > 0
    case 'set_income':
      return p.amount >= 0
    case 'add_category':
    case 'update_category':
      return !!p.label.trim()
  }
}

/* ── Card ─────────────────────────────────────────────────────────────────── */

export function ProposalCard({
  proposal,
  status,
  onChange,
  onAccept,
  onDiscard,
}: {
  proposal: EditableProposal
  status: ProposalStatus
  onChange: (next: EditableProposal) => void
  onAccept: () => void
  onDiscard: () => void
}) {
  const meta = META[proposal.type]
  const Icon = status === 'applied' ? Check : meta.icon
  const pending = status === 'pending'
  const cur = proposal.type === 'add_account' || proposal.type === 'update_account'
    ? proposal.account.country === 'IN' ? '₹' : '$'
    : '$'

  return (
    <div
      className={cn(
        'mt-1 overflow-hidden rounded-xl border bg-card transition-all',
        status === 'applied'
          ? 'border-success/40'
          : status === 'discarded'
            ? 'border-border/60 opacity-60'
            : 'border-brand/30 shadow-[0_2px_10px_-4px_color-mix(in_oklch,var(--brand)_30%,transparent)]',
      )}
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-lg',
            status === 'applied' ? 'bg-success-muted/70 text-success' : 'ai-chip text-white',
          )}
        >
          <Icon size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {meta.verb}
          </span>
          <span className="block truncate text-[13px] font-medium text-foreground">
            {proposal.summary || meta.verb}
          </span>
        </span>
        {status === 'applied' && (
          <span className="shrink-0 rounded-full bg-success-muted/70 px-2 py-0.5 text-[10px] font-semibold text-success ring-1 ring-success/20">
            Applied
          </span>
        )}
        {status === 'discarded' && (
          <span className="shrink-0 text-[11px] text-muted-foreground">Discarded</span>
        )}
      </div>

      {/* body — editable while pending, read-only summary once resolved */}
      {pending && (
        <>
          <div className="grid grid-cols-2 gap-2.5 p-3">
            {(proposal.type === 'add_account' || proposal.type === 'update_account') && (
              <AccountFieldset
                a={proposal.account}
                cur={cur}
                onChange={(account) => onChange({ ...proposal, account })}
              />
            )}
            {(proposal.type === 'add_goal' || proposal.type === 'update_goal') && (
              <GoalFieldset g={proposal.goal} onChange={(goal) => onChange({ ...proposal, goal })} />
            )}
            {proposal.type === 'set_income' && (
              <Field label="Monthly income" className="col-span-2">
                <NumberInput
                  prefix="$"
                  value={proposal.amount}
                  onChange={(amount) => onChange({ ...proposal, amount })}
                />
              </Field>
            )}
            {(proposal.type === 'add_category' || proposal.type === 'update_category') && (
              <>
                <Field label="Category" className="col-span-2">
                  <TextInput
                    value={proposal.label}
                    onChange={(label) => onChange({ ...proposal, label })}
                    placeholder="e.g. Rent"
                  />
                </Field>
                <Field label="Monthly amount" className="col-span-2">
                  <NumberInput
                    prefix="$"
                    value={proposal.amount}
                    onChange={(amount) => onChange({ ...proposal, amount })}
                  />
                </Field>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-3 py-2">
            <button
              onClick={onDiscard}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={13} />
              Discard
            </button>
            <button
              onClick={onAccept}
              disabled={!canApply(proposal)}
              className="btn-primary inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium disabled:pointer-events-none disabled:opacity-40"
            >
              <Check size={13} />
              Accept
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Fieldsets ────────────────────────────────────────────────────────────── */

function AccountFieldset({
  a,
  cur,
  onChange,
}: {
  a: AccountFields
  cur: string
  onChange: (a: AccountFields) => void
}) {
  const liability = a.kind === 'liability'
  const spec = detailSpec(a.country, a.accountType, a.isSgb ?? false, a.fdScheme ?? 'NRE')
  return (
    <>
      <Field label="Nickname">
        <TextInput value={a.nickname} onChange={(nickname) => onChange({ ...a, nickname })} placeholder="e.g. ICICI NRE" />
      </Field>
      <Field label="Institution">
        <TextInput value={a.institution} onChange={(institution) => onChange({ ...a, institution })} placeholder="e.g. ICICI Bank" />
      </Field>
      <Field label="Type">
        <Select value={a.accountType} onChange={(v) => onChange({ ...a, accountType: v as AccountType })}>
          {ACCOUNT_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
          ))}
        </Select>
      </Field>
      <Field label="Country">
        <Select value={a.country} onChange={(v) => onChange({ ...a, country: v as 'US' | 'IN' })}>
          <option value="US">United States</option>
          <option value="IN">India</option>
        </Select>
      </Field>
      <Field label="Balance">
        <NumberInput prefix={cur} value={a.balance} onChange={(balance) => onChange({ ...a, balance })} />
      </Field>
      <Field label="Holding">
        <Select value={a.kind} onChange={(v) => onChange({ ...a, kind: v as 'asset' | 'liability' })}>
          <option value="asset">Asset</option>
          <option value="liability">Liability (debt)</option>
        </Select>
      </Field>

      {/* Instrument-specific fields — only the ones that fit this type */}
      {spec.interestRate && (
        <Field label={liability ? 'Interest rate (APR)' : 'Interest rate'}>
          <NumberInput suffix="%" value={a.interestRate ?? 0} onChange={(interestRate) => onChange({ ...a, interestRate })} />
        </Field>
      )}
      {spec.expectedReturn && (
        <Field label="Expected return / yr">
          <NumberInput suffix="%" value={a.expectedReturn ?? 0} onChange={(expectedReturn) => onChange({ ...a, expectedReturn })} />
        </Field>
      )}
      {spec.maturityDate && (
        <Field label={liability ? 'Payoff date' : 'Maturity date'}>
          <DateInput value={a.maturityDate ?? ''} onChange={(maturityDate) => onChange({ ...a, maturityDate })} />
        </Field>
      )}
      {spec.minPayment && (
        <Field label="Min. payment / mo">
          <NumberInput prefix={cur} value={a.minPayment ?? 0} onChange={(minPayment) => onChange({ ...a, minPayment })} />
        </Field>
      )}
      {spec.schemeToggle && (
        <Field label="Scheme">
          <Select value={a.fdScheme ?? 'NRE'} onChange={(v) => onChange({ ...a, fdScheme: v as 'NRE' | 'NRO' })}>
            <option value="NRE">NRE — tax-free</option>
            <option value="NRO">NRO — taxable</option>
          </Select>
        </Field>
      )}
      {spec.tdsRate && (
        <Field label="TDS withheld">
          <NumberInput suffix="%" value={a.tdsRate ?? 0} onChange={(tdsRate) => onChange({ ...a, tdsRate })} />
        </Field>
      )}
      {spec.compounding && (
        <Field label="Compounding">
          <Select
            value={a.compounding ?? 'quarterly'}
            onChange={(v) => onChange({ ...a, compounding: v as NonNullable<HoldingDetails['compounding']> })}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half-yearly</option>
            <option value="annually">Annually</option>
            <option value="maturity">At maturity</option>
          </Select>
        </Field>
      )}
      {spec.depositCurrency && (
        <Field label="Deposit currency">
          <Select
            value={a.depositCurrency ?? 'USD'}
            onChange={(v) => onChange({ ...a, depositCurrency: v as NonNullable<HoldingDetails['depositCurrency']> })}
          >
            {['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'INR'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
      )}
      {spec.goldToggle && (
        <Field label="Form of gold">
          <Select value={a.isSgb ? 'sgb' : 'physical'} onChange={(v) => onChange({ ...a, isSgb: v === 'sgb' })}>
            <option value="physical">Physical / ETF</option>
            <option value="sgb">Sovereign Gold Bond</option>
          </Select>
        </Field>
      )}
    </>
  )
}

function GoalFieldset({ g, onChange }: { g: GoalFields; onChange: (g: GoalFields) => void }) {
  return (
    <>
      <Field label="Name" className="col-span-2">
        <TextInput value={g.name} onChange={(name) => onChange({ ...g, name })} placeholder="e.g. India home" />
      </Field>
      <Field label="Category">
        <Select
          value={g.category}
          onChange={(v) => {
            const category = v as GoalCategory
            onChange({ ...g, category, kind: defaultGoalKind(category) })
          }}
        >
          {GOAL_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{GOAL_CATEGORY_META[c].label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Type">
        <Select value={g.kind} onChange={(v) => onChange({ ...g, kind: v as GoalKind })}>
          <option value="investment">Investment</option>
          <option value="cost">Cost</option>
        </Select>
      </Field>
      <Field label="Target (USD)">
        <NumberInput prefix="$" value={g.targetUsd} onChange={(targetUsd) => onChange({ ...g, targetUsd })} />
      </Field>
      <Field label="Saved so far (USD)">
        <NumberInput prefix="$" value={g.currentUsd} onChange={(currentUsd) => onChange({ ...g, currentUsd })} />
      </Field>
      <Field label="Target year" className="col-span-2">
        <NumberInput value={g.targetYear} onChange={(targetYear) => onChange({ ...g, targetYear })} />
      </Field>
    </>
  )
}

/* ── Inputs ───────────────────────────────────────────────────────────────── */

const inputCls =
  'w-full rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-[13px] tabular-nums outline-none transition-colors focus:border-brand/60 focus:ring-[2px] focus:ring-brand/12'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(inputCls, 'placeholder:text-muted-foreground/50')}
    />
  )
}

function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
          {prefix}
        </span>
      )}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value || ''}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={cn(inputCls, prefix && 'pl-6', suffix && 'pr-7')}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {children}
    </select>
  )
}
