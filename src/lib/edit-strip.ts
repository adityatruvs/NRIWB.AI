/**
 * The edit strip under a row on the Accounts sheet: name, type, balance, rate,
 * maturity or monthly payment, and whose name. Pure helpers: the draft a row
 * opens with, what is wrong with it, and the account it saves as. Only the
 * fields the strip shows are touched; everything else on the account (loan
 * links, compounding, TDS…) is kept as it is.
 */

import {
  balancesFromEntry,
  detailSpec,
  entryAmount,
  entryCurrency,
  fromTypeChoice,
  type DetailSpec,
  type TypeChoice,
} from '@/lib/account-details'
import type { CoOwner, Holding, HoldingDetails, OwnerRelation, Ownership } from '@/lib/portfolio'
import { formatAmountInput, holdingChoice, parseAmountInput, retypeHolding } from '@/lib/quick-entry'

export interface StripDraft {
  name: string
  choice: TypeChoice
  amount: string
  rate: string
  maturity: string
  payment: string
  ownership: Ownership
  relation: OwnerRelation
  person: string
}

export type StripField = keyof StripDraft
export type StripErrors = Partial<Record<StripField, string>>

const DATE = /^\d{4}-\d{2}-\d{2}$/
const roundCents = (n: number) => Math.round(n * 100) / 100

/** The amount as the strip's balance box shows it. */
function amountText(h: Holding, rate: number): string {
  return formatAmountInput(roundCents(entryAmount(h, rate)), entryCurrency(h.country, h.accountType))
}

export function draftFromHolding(h: Holding, rate: number): StripDraft {
  const first = h.coOwners?.[0]
  return {
    name: h.nickname,
    choice: holdingChoice(h),
    amount: amountText(h, rate),
    rate: h.details?.interestRate != null ? String(h.details.interestRate) : '',
    maturity: h.details?.maturityDate ?? '',
    payment: h.details?.minPayment != null ? String(h.details.minPayment) : '',
    ownership: h.ownership ?? 'self',
    relation: first?.relation ?? 'spouse',
    person: first?.name ?? '',
  }
}

/** Which of rate / maturity / payment this draft's type has. */
export function stripSpec(h: Holding, choice: TypeChoice): DetailSpec {
  const { accountType, fdScheme } = fromTypeChoice(choice)
  return detailSpec(h.country, accountType, !!h.details?.isSgb, fdScheme ?? h.details?.fdScheme ?? 'NRE')
}

/**
 * Picking another type in the strip. A balance typed in the old type's currency
 * is kept; if the new type is entered in the other currency (FCNR is in dollars),
 * the box shows the saved balance in that currency instead.
 */
export function changeStripType(h: Holding, draft: StripDraft, choice: TypeChoice, rate: number): StripDraft {
  const next = { ...draft, choice }
  const retyped = retypeHolding(h, choice)
  if (entryCurrency(h.country, retyped.accountType) !== entryCurrency(h.country, fromTypeChoice(draft.choice).accountType)) {
    next.amount = amountText(retyped, rate)
  }
  return next
}

/** What is wrong with the draft, by field. Empty when it can be saved. */
export function validateStrip(h: Holding, draft: StripDraft): StripErrors {
  const e: StripErrors = {}
  const spec = stripSpec(h, draft.choice)
  if (!draft.name.trim()) e.name = 'Enter a name'
  // A linked account's balance is the bank's, so it is not checked here.
  if (h.source === 'manual') {
    const n = parseAmountInput(draft.amount)
    if (n == null) e.amount = 'Enter an amount'
    else if (Number.isNaN(n) || n <= 0) e.amount = 'Use numbers above zero, or 40L / 1.2Cr / 95k'
  }
  if (spec.interestRate && draft.rate.trim()) {
    const r = Number(draft.rate.replace(/%/g, '').trim())
    if (!Number.isFinite(r) || r < 0 || r > 100) e.rate = 'Use a rate from 0 to 100'
  }
  if (spec.maturityDate && draft.maturity && (!DATE.test(draft.maturity) || Number.isNaN(Date.parse(draft.maturity)))) {
    e.maturity = 'Use a real date'
  }
  if (spec.minPayment && draft.payment.trim()) {
    const p = parseAmountInput(draft.payment)
    if (p == null || Number.isNaN(p) || p <= 0) e.payment = 'Use numbers above zero'
  }
  return e
}

/** The account the draft saves as. Call only when `validateStrip` found nothing. */
export function applyStrip(a: Holding, draft: StripDraft, rate: number): Holding {
  let h: Holding = draft.choice === holdingChoice(a) ? { ...a } : retypeHolding(a, draft.choice)
  h.nickname = draft.name.trim()

  if (a.source === 'manual') {
    const n = parseAmountInput(draft.amount)
    if (n != null && !Number.isNaN(n) && n !== roundCents(entryAmount(h, rate))) {
      h = { ...h, ...balancesFromEntry(h.country, h.accountType, n, rate) }
    }
  }

  const spec = stripSpec(h, draft.choice)
  const d: HoldingDetails = { ...h.details }
  if (spec.interestRate) {
    const r = draft.rate.replace(/%/g, '').trim()
    if (r) d.interestRate = Number(r)
    else delete d.interestRate
  }
  if (spec.maturityDate) {
    if (draft.maturity) d.maturityDate = draft.maturity
    else delete d.maturityDate
  }
  if (spec.minPayment) {
    const p = parseAmountInput(draft.payment)
    if (p != null && !Number.isNaN(p)) d.minPayment = p
    else delete d.minPayment
  }
  h.details = Object.keys(d).length ? d : undefined

  if (draft.ownership === 'self') {
    delete h.ownership
    delete h.coOwners
  } else {
    const first: CoOwner = { relation: draft.relation, name: draft.person.trim() }
    h.ownership = draft.ownership
    h.coOwners = [first, ...(a.coOwners?.slice(1) ?? [])]
  }
  return h
}
