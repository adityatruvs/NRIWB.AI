/**
 * Quick entry: what a person says about their money, as one draft line per
 * account, checked on one screen and saved only when every line is complete.
 * Also the inline edits the Accounts sheet makes to saved rows. Pure functions,
 * shared by the Accounts page, the parse route and their tests.
 */

import { LIABILITY_TYPES, type Holding, type HoldingDetails } from '@/lib/portfolio'
import {
  detailSpec,
  entryCurrency,
  fromTypeChoice,
  typeChoice,
  typeChoicesFor,
  type TypeChoice,
} from '@/lib/account-details'

export type Country = 'US' | 'IN'
export type Kind = 'asset' | 'liability'

/** One account on the review list, before it's saved. */
export interface DraftLine {
  id: string
  /** Null when what was said didn't make the country clear — the user picks. */
  country: Country | null
  kind: Kind
  /** Null until named or picked: the AI never guesses a type. */
  type: TypeChoice | null
  name: string
  institution: string
  /** In `currency`, as said or typed. Null when no amount was given. */
  amount: number | null
  currency: 'USD' | 'INR'
  interestRate?: number
  maturityDate?: string
  minPayment?: number
  /** The words this line came from, shown as a tooltip. */
  said?: string
  /** A nudge for the type pick, e.g. "NRE or NRO savings?". */
  hint?: 'savings' | 'fd'
}

/** What a line still needs before it can be saved. */
export type Missing = 'where' | 'type' | 'amount'

export function lineMissing(l: DraftLine): Missing[] {
  const m: Missing[] = []
  if (!l.country) m.push('where')
  if (!l.type) m.push('type')
  if (l.amount == null || !(l.amount > 0)) m.push('amount')
  return m
}

/** Nothing is saved until every line has a place, a type and an amount. */
export function readyToSave(lines: DraftLine[]): boolean {
  return lines.length > 0 && lines.every((l) => lineMissing(l).length === 0)
}

export function missingCounts(lines: DraftLine[]): { type: number; amount: number } {
  let type = 0
  let amount = 0
  for (const l of lines) {
    const m = lineMissing(l)
    if (m.includes('where') || m.includes('type')) type++
    if (m.includes('amount')) amount++
  }
  return { type, amount }
}

/* ── Amounts ──────────────────────────────────────────────────────────────── */

const UNITS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  l: 1e5,
  lac: 1e5,
  lacs: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
}

/**
 * A typed amount in full units: "40L" → 4,000,000, "1.2 Cr" → 12,000,000,
 * "95k" → 95,000, "5,00,000" → 500,000. Null for blank, NaN when unreadable.
 */
export function parseAmountInput(input: string): number | null {
  const t = input
    .trim()
    .toLowerCase()
    .replace(/^(rs\.?|inr|usd)\s*/, '')
    .replace(/[₹$,\s]/g, '')
  if (!t) return null
  const m = t.match(/^(\d*\.?\d+)([a-z]+)?$/)
  if (!m) return NaN
  const unit = m[2] ? UNITS[m[2]] : 1
  if (!unit) return NaN
  return Math.round(parseFloat(m[1]) * unit * 100) / 100
}

/** An amount as it sits in an input: grouped the way its currency is written. */
export function formatAmountInput(amount: number | null | undefined, currency: 'USD' | 'INR'): string {
  if (amount == null || !Number.isFinite(amount)) return ''
  return amount.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 })
}

/* ── Building lines ───────────────────────────────────────────────────────── */

let seq = 0
export function newLineId(): string {
  seq += 1
  return `line-${Date.now().toString(36)}-${seq}`
}

/** The currency a line's amount is typed in, before anything was typed. */
export function lineCurrency(country: Country | null, type: TypeChoice | null): 'USD' | 'INR' {
  if (!country) return 'INR'
  return type ? entryCurrency(country, fromTypeChoice(type).accountType) : country === 'US' ? 'USD' : 'INR'
}

/** A blank line for a picked tile ("+ Property" under India assets). */
export function blankLine(country: Country, kind: Kind, type: TypeChoice | null, name = ''): DraftLine {
  return { id: newLineId(), country, kind, type, name, institution: '', amount: null, currency: lineCurrency(country, type) }
}

/**
 * Changing a line's type. An amount already typed keeps the currency it was
 * typed in; an empty line follows the new type's currency (FCNR is in dollars).
 */
export function retypeLine(l: DraftLine, type: TypeChoice | null): DraftLine {
  const next = { ...l, type, hint: undefined }
  if (l.amount == null) next.currency = lineCurrency(l.country, type)
  return next
}

/** Moving a line from "Not sure where" into a country / side. A type that doesn't fit is cleared. */
export function placeLine(l: DraftLine, country: Country, kind: Kind): DraftLine {
  const type = l.type && typeChoicesFor(country, kind).includes(l.type) ? l.type : null
  return { ...l, country, kind, type, currency: l.amount == null ? lineCurrency(country, type) : l.currency }
}

/* ── Saving ───────────────────────────────────────────────────────────────── */

/**
 * The Holding a complete line saves as. Both balances come from the amount in
 * the currency it was given, at the app's live rate. Only the detail fields the
 * type actually has are kept.
 */
export function lineToHolding(l: DraftLine, rate: number): Holding {
  if (!l.country || !l.type || l.amount == null) throw new Error('line is incomplete')
  const { accountType, fdScheme } = fromTypeChoice(l.type)
  const kind: Kind = LIABILITY_TYPES.has(accountType) ? 'liability' : l.kind
  const amount = Math.abs(l.amount)
  const balances =
    l.currency === 'USD'
      ? { balanceUsd: amount, balanceInr: amount * rate }
      : { balanceUsd: amount / rate, balanceInr: amount }
  const spec = detailSpec(l.country, accountType, false, fdScheme ?? 'NRE')
  const details: HoldingDetails = {}
  if (spec.hasScheme && fdScheme) details.fdScheme = fdScheme
  if (spec.interestRate && l.interestRate != null) details.interestRate = l.interestRate
  if (spec.maturityDate && l.maturityDate) details.maturityDate = l.maturityDate
  if (spec.minPayment && l.minPayment != null) details.minPayment = l.minPayment
  if (spec.depositCurrency) details.depositCurrency = 'USD'
  const name = l.name.trim() || l.institution.trim()
  return {
    nickname: name.slice(0, 120),
    // The ledger needs an institution; a flat or a loan from family may have none.
    institution: (l.institution.trim() || name).slice(0, 120),
    accountType,
    country: l.country,
    ...balances,
    isPfic: kind === 'asset' && l.country === 'IN' && accountType === 'mutual_fund',
    source: 'manual',
    kind,
    details: Object.keys(details).length ? details : undefined,
  }
}

/* ── Inline edits on saved rows ───────────────────────────────────────────── */

/**
 * A saved account re-typed from the sheet. Balances stay as they are (the money
 * didn't change, only its label); detail fields the new type doesn't have are dropped.
 */
export function retypeHolding(h: Holding, choice: TypeChoice): Holding {
  const { accountType, fdScheme } = fromTypeChoice(choice)
  const scheme = fdScheme ?? h.details?.fdScheme ?? 'NRE'
  const spec = detailSpec(h.country, accountType, !!h.details?.isSgb, scheme)
  const d = h.details ?? {}
  const details: HoldingDetails = {}
  if (spec.interestRate && d.interestRate != null) details.interestRate = d.interestRate
  if (spec.expectedReturn && d.expectedReturn != null) details.expectedReturn = d.expectedReturn
  if (spec.maturityDate && d.maturityDate) details.maturityDate = d.maturityDate
  if (spec.compounding && d.compounding) details.compounding = d.compounding
  if (spec.depositCurrency) details.depositCurrency = d.depositCurrency ?? 'USD'
  if (spec.tdsRate && d.tdsRate != null) details.tdsRate = d.tdsRate
  if (spec.hasScheme) details.fdScheme = scheme
  if (spec.minPayment && d.minPayment != null) details.minPayment = d.minPayment
  if (spec.goldToggle && d.isSgb) details.isSgb = true
  return {
    ...h,
    accountType,
    isPfic: h.country === 'IN' && accountType === 'mutual_fund' && h.kind !== 'liability',
    details: Object.keys(details).length ? details : undefined,
  }
}

/** The type choice a saved account shows in the sheet's picker. */
export function holdingChoice(h: Holding): TypeChoice {
  return typeChoice(h.country, h.accountType, h.details?.fdScheme)
}

/* ── Review groups ────────────────────────────────────────────────────────── */

export interface LineGroup {
  key: 'IN:asset' | 'US:asset' | 'IN:liability' | 'US:liability'
  country: Country
  kind: Kind
  label: string
  /** Tiles for "Anything else?", most common first. */
  tiles: TypeChoice[]
  /** Commonly forgotten — drawn dashed until one is on the list. */
  forgotten: TypeChoice[]
}

export const LINE_GROUPS: LineGroup[] = [
  {
    key: 'IN:asset',
    country: 'IN',
    kind: 'asset',
    label: 'India assets',
    tiles: ['nre', 'nro', 'fd_nre', 'fcnr', 'mutual_fund', 'brokerage', 'property', 'gold'],
    forgotten: ['property', 'gold'],
  },
  {
    key: 'US:asset',
    country: 'US',
    kind: 'asset',
    label: 'US assets',
    tiles: ['checking', 'savings', 'brokerage', '401k', 'ira', 'roth_ira', 'real_estate'],
    forgotten: ['401k', 'real_estate'],
  },
  {
    key: 'IN:liability',
    country: 'IN',
    kind: 'liability',
    label: 'India liabilities',
    tiles: ['home_loan', 'auto_loan', 'education_loan', 'personal_loan', 'credit_card'],
    forgotten: ['home_loan', 'credit_card'],
  },
  {
    key: 'US:liability',
    country: 'US',
    kind: 'liability',
    label: 'US liabilities',
    tiles: ['mortgage', 'auto_loan', 'student_loan', 'credit_card', 'personal_loan'],
    forgotten: ['credit_card', 'mortgage'],
  },
]
