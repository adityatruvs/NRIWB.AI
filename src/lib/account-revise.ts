/**
 * "Add or change with AI" on the quick-entry list: what a person says about the
 * lines already on it ("the HDFC ones are NRE and NRO", "also a flat in
 * Hyderabad") becomes new lines and edits to existing ones.
 *
 * Two pure steps, so the guarantees don't depend on the model behaving:
 *  - `resolveRevision` (server) reads the model's reply against a snapshot of the
 *    list. If a change could point at more than one account, it returns an
 *    `ambiguous` message and NO changes at all.
 *  - `applyRevision` (client) applies the resolved changes to the list as it is
 *    now, by line id, and says which lines changed so they can be highlighted.
 */

import { typeChoiceLabel, typeChoicesFor, type TypeChoice } from '@/lib/account-details'
import { GROUPS, MAX_SAID_CHARS, linesFromModel } from '@/lib/account-parse'
import {
  LINE_GROUPS,
  lineCurrency,
  placeLine,
  retypeLine,
  type DraftLine,
  type LineGroup,
} from '@/lib/quick-entry'

/** Most lines a revision will look at. */
export const MAX_REVISE_LINES = 60

/** What the model is shown of each line. Never the words it came from. */
export type SnapshotLine = Pick<
  DraftLine,
  'id' | 'country' | 'kind' | 'type' | 'name' | 'institution' | 'amount' | 'currency'
>

/** The fields a spoken change can set on a line. Every value is already checked. */
export interface LinePatch {
  group?: LineGroup['key']
  type?: TypeChoice
  name?: string
  institution?: string
  amount?: number
  currency?: 'USD' | 'INR'
  interestRate?: number
  maturityDate?: string
  minPayment?: number
}

export interface Revision {
  adds: DraftLine[]
  updates: { id: string; patch: LinePatch }[]
  /** More than one account could match: nothing in this revision may be applied. */
  ambiguous?: string
  /** The words that pointed at an account that isn't on the list. */
  notFound?: string[]
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const num = (v: unknown): number | undefined =>
  v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? undefined : Number(v)

/* ── What the model sees ──────────────────────────────────────────────────── */

const where = (l: SnapshotLine) =>
  !l.country ? 'country not clear' : `${l.country === 'IN' ? 'India' : 'US'} ${l.kind === 'liability' ? 'owed' : 'owned'}`

/** The client's list, read defensively: this arrives from the browser. Null when it isn't a list. */
export function readSnapshot(raw: unknown): SnapshotLine[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_REVISE_LINES) return null
  const out: SnapshotLine[] = []
  for (const it of raw) {
    if (!it || typeof it !== 'object') return null
    const l = it as Record<string, unknown>
    const id = str(l.id, 80)
    if (!id) return null
    const types = new Set(GROUPS.flatMap((g) => typeChoicesFor(g.country, g.kind)))
    const amount = num(l.amount)
    out.push({
      id,
      country: l.country === 'IN' || l.country === 'US' ? l.country : null,
      kind: l.kind === 'liability' ? 'liability' : 'asset',
      type: typeof l.type === 'string' && types.has(l.type as TypeChoice) ? (l.type as TypeChoice) : null,
      name: str(l.name, 60),
      institution: str(l.institution, 60),
      amount: amount != null && amount > 0 ? amount : null,
      currency: l.currency === 'USD' ? 'USD' : 'INR',
    })
  }
  if (new Set(out.map((l) => l.id)).size !== out.length) return null
  return out
}

const refOf = (index: number) => `L${index + 1}`

export function buildReviseSystem(today: string): string {
  const groups = GROUPS.map(
    (g) =>
      `- ${g.id} = ${g.label}. Allowed types: ${typeChoicesFor(g.country, g.kind)
        .map((t) => `${t} (${typeChoiceLabel(t)})`)
        .join(', ')}`,
  ).join('\n')
  return `A non-resident Indian (NRI) is building a list of their accounts and now tells you what to add or change. You are shown the list (one line per account, each with a ref like L3) and their words. Turn the words into changes. Nothing is saved from here: they check the list afterwards.

Return ONLY a JSON object, no prose and no code fences:
{"changes":[
 {"action":"add","group":"IN_asset|US_asset|IN_liability|US_liability|unknown","type":"<allowed type id> or null","institution":"","name":"","amount":number or null,"currency":"USD|INR","interestRate":number or null,"maturityDate":"YYYY-MM-DD" or null,"monthlyPayment":number or null,"said":"the words this came from"},
 {"action":"update","phrase":"the words they used to point at the account(s)","matches":["L1"],"all":false,"set":{"group":"... or omit","type":"... or omit","name":"...","institution":"...","amount":number,"currency":"USD|INR","interestRate":number,"maturityDate":"YYYY-MM-DD","monthlyPayment":number},"setInOrder":null}
]}

Groups and their type ids:
${groups}

Rules:
- "add" is for an account that is NOT already on the list. Never add what is already there. Fill it in as you would for a new account: do NOT guess the type, set "type" only when they clearly named it (NRE, NRO, an NRE or NRO fixed deposit, checking, 401k, brokerage, flat/house/property, home loan, credit card…); a flat in Hyderabad is type "property" in IN_asset.
- "update" changes accounts already on the list. In "set" include ONLY the fields they asked to change.
- "matches" lists the refs of EVERY account their words could refer to, not just your best guess. "HDFC" with two HDFC lines gives both refs.
- "all": true only when they clearly mean every one of the matches ("the HDFC ones", "all my HDFC accounts", "both"). If they pointed at one account, "all" is false. Never pick one of several matches yourself.
- "setInOrder": when they give a different change to each of several accounts in the order of the list ("the HDFC ones are NRE and NRO"), set "all": true, list ALL those refs in "matches" in list order, leave "set" as {}, and put one set object per account in "setInOrder" in the same order, e.g. [{"type":"nre"},{"type":"nro"}]. Otherwise "setInOrder" is null.
- If they refer to an account that is not on the list, give "matches": [].
- Amounts in full units with no commas: 1 lakh = 100000, 1 crore = 10000000, k = 1000. "currency" is the currency the amount was said in (₹, lakh, crore → INR; $ → USD). NEVER convert between currencies.
- Today is ${today}. If the words are not about adding or changing accounts, return {"changes":[]}. Give no advice.`
}

/** The list and the person's words, as the one user message. */
export function buildReviseUser(lines: SnapshotLine[], text: string): string {
  const rows = lines.length
    ? lines
        .map(
          (l, i) =>
            `${refOf(i)}: ${where(l)} · type ${l.type ?? 'none'} · name “${l.name}” · institution “${l.institution}” · ${
              l.amount != null ? `${l.amount} ${l.currency}` : 'no amount'
            }`,
        )
        .join('\n')
    : '(the list is empty)'
  return `Their list:\n${rows}\n\nThey said: ${text.slice(0, MAX_SAID_CHARS)}`
}

/* ── Reading the reply ────────────────────────────────────────────────────── */

const DATE = /^\d{4}-\d{2}-\d{2}$/

function readPatch(raw: unknown): LinePatch {
  if (!raw || typeof raw !== 'object') return {}
  const s = raw as Record<string, unknown>
  const p: LinePatch = {}
  const group = LINE_GROUPS.find((g) => g.key === String(s.group ?? '').replace('_', ':'))
  if (group) p.group = group.key
  const known = new Set(GROUPS.flatMap((g) => typeChoicesFor(g.country, g.kind)))
  if (typeof s.type === 'string' && known.has(s.type as TypeChoice)) p.type = s.type as TypeChoice
  const name = str(s.name, 60)
  if (name) p.name = name
  const institution = str(s.institution, 60)
  if (institution) p.institution = institution
  const amount = num(s.amount)
  if (amount != null && amount > 0) {
    p.amount = amount
    if (s.currency === 'USD' || s.currency === 'INR') p.currency = s.currency
  }
  const rate = num(s.interestRate)
  if (rate != null && rate > 0 && rate < 100) p.interestRate = rate
  if (typeof s.maturityDate === 'string' && DATE.test(s.maturityDate) && !Number.isNaN(Date.parse(s.maturityDate))) {
    p.maturityDate = s.maturityDate
  }
  const pay = num(s.monthlyPayment)
  if (pay != null && pay > 0) p.minPayment = pay
  return p
}

const STOP = new Set(['the', 'a', 'an', 'my', 'of', 'at', 'in', 'one', 'ones', 'account', 'accounts', 'is', 'are'])
const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w))

/**
 * Backstop for the model: the lines whose own words contain every word of the
 * phrase. Used only to catch a change the model aimed at one account when the
 * phrase fits more (e.g. "HDFC" with two HDFC lines).
 */
function linesNamed(lines: SnapshotLine[], phrase: string): number[] {
  const want = words(phrase)
  if (want.length === 0) return []
  const hits: number[] = []
  lines.forEach((l, i) => {
    const have = new Set(words(`${l.name} ${l.institution}`))
    if (want.every((w) => have.has(w))) hits.push(i)
  })
  return hits
}

function ambiguousAbout(lines: SnapshotLine[], idx: number[]): string {
  const names = idx.map((i) => lines[i].name || lines[i].institution || 'Account')
  const shown = idx.slice(0, 4).map((i, k) => {
    const n = names[k]
    return names.filter((x) => x === n).length > 1 ? `${n} (line ${i + 1})` : n
  })
  const more = idx.length > 4 ? ` and ${idx.length - 4} more` : ''
  return `More than one account fits that: ${shown.join(', ')}${more}. Nothing was changed. Say which one you mean, for example “${names[0]}”.`
}

/**
 * The model's reply, checked against the list it was shown. Any change that
 * could point at more than one account makes the whole revision `ambiguous`
 * and empty: either everything is clear, or nothing changes.
 */
export function resolveRevision(snapshot: SnapshotLine[], obj: Record<string, unknown>): Revision {
  const changes = (Array.isArray(obj.changes) ? obj.changes : []).filter(
    (c): c is Record<string, unknown> => !!c && typeof c === 'object',
  )
  const byRef = new Map(snapshot.map((_, i) => [refOf(i), i]))
  const updates: Revision['updates'] = []
  const notFound: string[] = []

  for (const c of changes) {
    if (c.action !== 'update') continue
    const phrase = str(c.phrase, 80)
    const matched = [
      ...new Set(
        (Array.isArray(c.matches) ? c.matches : [])
          .map((r) => byRef.get(String(r)))
          .filter((i): i is number => i != null),
      ),
    ].sort((a, b) => a - b)
    if (matched.length === 0) {
      notFound.push(phrase || 'that account')
      continue
    }
    const all = c.all === true
    const inOrder = Array.isArray(c.setInOrder) ? c.setInOrder : null

    if (inOrder) {
      // A different change per account, in list order: only when the counts line up.
      if (!all || matched.length < 2 || inOrder.length !== matched.length) {
        return { adds: [], updates: [], ambiguous: ambiguousAbout(snapshot, matched) }
      }
      matched.forEach((i, k) => updates.push({ id: snapshot[i].id, patch: readPatch(inOrder[k]) }))
      continue
    }
    if (!all) {
      const fits = matched.length === 1 ? linesNamed(snapshot, phrase) : matched
      if (matched.length > 1 || fits.length > 1) {
        return { adds: [], updates: [], ambiguous: ambiguousAbout(snapshot, matched.length > 1 ? matched : fits) }
      }
    }
    const patch = readPatch(c.set)
    for (const i of matched) updates.push({ id: snapshot[i].id, patch })
  }

  const adds = linesFromModel({ accounts: changes.filter((c) => c.action === 'add') })
  return { adds, updates, ...(notFound.length ? { notFound } : {}) }
}

/* ── Applying it ──────────────────────────────────────────────────────────── */

const FIELDS = [
  'country',
  'kind',
  'type',
  'name',
  'institution',
  'amount',
  'currency',
  'interestRate',
  'maturityDate',
  'minPayment',
] as const

/** One line with a change applied. `skipped` names what couldn't be applied to it. */
function patchLine(l: DraftLine, p: LinePatch): { line: DraftLine; skipped: string[] } {
  let next: DraftLine = { ...l }
  const skipped: string[] = []

  if (p.group) {
    const g = LINE_GROUPS.find((x) => x.key === p.group)
    if (g) next = placeLine(next, g.country, g.kind)
  }
  if (p.type) {
    // A line with no country yet is placed by a type only one side has (an NRE account is in India).
    if (!next.country) {
      const owners = LINE_GROUPS.filter((g) => typeChoicesFor(g.country, g.kind).includes(p.type!))
      if (owners.length === 1) next = placeLine(next, owners[0].country, owners[0].kind)
    }
    if (next.country && typeChoicesFor(next.country, next.kind).includes(p.type)) next = retypeLine(next, p.type)
    else skipped.push(`${typeChoiceLabel(p.type)} doesn’t fit ${next.name || 'that account'}`)
  }
  if (p.name) next.name = p.name
  if (p.institution) next.institution = p.institution
  if (p.amount != null) {
    next.amount = p.amount
    next.currency = p.currency ?? (l.amount == null ? lineCurrency(next.country, next.type) : next.currency)
  }
  if (p.interestRate != null) next.interestRate = p.interestRate
  if (p.maturityDate) next.maturityDate = p.maturityDate
  if (p.minPayment != null && next.kind === 'liability') next.minPayment = p.minPayment

  return { line: next, skipped }
}

export interface Applied {
  lines: DraftLine[]
  /** New lines and lines that actually changed, for highlighting. */
  changedIds: string[]
  added: number
  updated: number
  skipped: string[]
}

/**
 * The resolved changes applied to the list as it is now. Lines are found by id,
 * so a line removed while the AI was thinking is simply skipped. A change that
 * sets what is already there does not count as a change.
 */
export function applyRevision(lines: DraftLine[], rev: Revision): Applied {
  if (rev.ambiguous) return { lines, changedIds: [], added: 0, updated: 0, skipped: [] }
  const current = new Map(lines.map((l) => [l.id, l]))
  const changed = new Set<string>()
  const skipped: string[] = []

  for (const u of rev.updates) {
    const before = current.get(u.id)
    if (!before) continue
    const { line: after, skipped: s } = patchLine(before, u.patch)
    skipped.push(...s)
    if (FIELDS.some((f) => before[f] !== after[f])) {
      current.set(u.id, after)
      changed.add(u.id)
    }
  }

  const room = Math.max(0, MAX_REVISE_LINES - lines.length)
  const adds = rev.adds.slice(0, room)
  return {
    lines: [...lines.map((l) => current.get(l.id) ?? l), ...adds],
    changedIds: [...changed, ...adds.map((l) => l.id)],
    added: adds.length,
    updated: changed.size,
    skipped,
  }
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** One line for the customer: what the revision did. */
export function describeApplied(a: Applied): string {
  const parts = [
    a.added ? `Added ${plural(a.added, 'account')}` : '',
    a.updated ? `${a.added ? 'changed' : 'Changed'} ${plural(a.updated, 'account')}` : '',
  ].filter(Boolean)
  const base = parts.length ? `${parts.join(' and ')}. They’re highlighted below.` : ''
  return [base, ...a.skipped.map((s) => `${s}.`)].filter(Boolean).join(' ')
}
