/**
 * "Tell us what you have" → one draft line per account. The prompt for NRIWB AI
 * and the strict reading of its reply: a type the person didn't clearly name is
 * left empty for them to pick, and nothing the model sends outside the allowed
 * lists survives.
 */

import { typeChoiceLabel, typeChoicesFor, type TypeChoice } from '@/lib/account-details'
import { lineCurrency, newLineId, type Country, type DraftLine, type Kind } from '@/lib/quick-entry'

/** Longest description sent to the model. */
export const MAX_SAID_CHARS = 4000
/** Most lines one description can produce. */
export const MAX_LINES = 40

const GROUPS: { id: string; country: Country; kind: Kind; label: string }[] = [
  { id: 'IN_asset', country: 'IN', kind: 'asset', label: 'India, owned (asset)' },
  { id: 'US_asset', country: 'US', kind: 'asset', label: 'US, owned (asset)' },
  { id: 'IN_liability', country: 'IN', kind: 'liability', label: 'India, owed (loan or card)' },
  { id: 'US_liability', country: 'US', kind: 'liability', label: 'US, owed (loan or card)' },
]

export function buildParseSystem(today: string): string {
  const groups = GROUPS.map(
    (g) =>
      `- ${g.id} = ${g.label}. Allowed types: ${typeChoicesFor(g.country, g.kind)
        .map((t) => `${t} (${typeChoiceLabel(t)})`)
        .join(', ')}`,
  ).join('\n')
  return `You turn what a non-resident Indian (NRI) says about their money into a list of accounts they will check before anything is saved. List every account you hear, one element per account.

Return ONLY a JSON object, no prose and no code fences:
{"accounts":[{"group":"IN_asset|US_asset|IN_liability|US_liability|unknown","type":"<allowed type id> or null","institution":"bank, broker or lender, or empty","name":"short label they'd recognise","amount":number or null,"currency":"USD|INR","interestRate":number or null,"maturityDate":"YYYY-MM-DD" or null,"monthlyPayment":number or null,"said":"the words this came from"}]}

Groups and their type ids:
${groups}

Rules:
- One element per account. "Two accounts at HDFC" is two elements with the same institution, named "HDFC Bank account 1" and "HDFC Bank account 2".
- Do NOT guess the type. Set "type" only when they clearly named it (NRE, NRO, FCNR, an NRE or NRO fixed deposit, checking, 401k, IRA, Roth, brokerage, mutual fund, PPF is "other", gold, flat/house/property, home loan, mortgage, credit card…). A plain "account", an India "savings account" (NRE or NRO?) or an India "FD" without NRE/NRO has type null.
- "group" from the institution's country or from what was said; "unknown" when it isn't clear. Loans and cards go in a *_liability group with amount = what is owed. A flat with a loan is two elements.
- Amounts in full units with no commas: 1 lakh = 100000, 1 crore = 10000000, k = 1000. Only amounts they said; otherwise null. "5 lakh each" gives each element 500000.
- "currency" is the currency the amount was said in (₹, lakh, crore → INR; $ → USD). NEVER convert between currencies. With no amount, use the group's own currency (FCNR deposits are USD).
- "name": at most 40 characters, the institution plus what it is, e.g. "Axis Bank NRE Fixed Deposit", "Flat in Hyderabad", "Fidelity 401(k)".
- Today is ${today}. Never add accounts they didn't mention, and give no advice.`
}

/** The JSON object in the model's reply, tolerating stray prose or code fences. */
export function parseJsonObject(text: string): Record<string, unknown> {
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) raw = fence[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no json object found')
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
}

const num = (v: unknown): number | undefined =>
  v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v)

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Read the model's reply into draft lines. Anything malformed is dropped or blanked. */
export function linesFromModel(obj: Record<string, unknown>): DraftLine[] {
  const raw = Array.isArray(obj.accounts) ? obj.accounts : []
  const out: DraftLine[] = []
  for (const it of raw.slice(0, MAX_LINES)) {
    if (!it || typeof it !== 'object') continue
    const a = it as Record<string, unknown>
    const group = GROUPS.find((g) => g.id === a.group)
    const typeId = typeof a.type === 'string' ? (a.type as TypeChoice) : null

    let country: Country | null = group?.country ?? null
    let kind: Kind = group?.kind ?? 'asset'
    let type: TypeChoice | null = null
    if (group) {
      type = typeId && typeChoicesFor(group.country, group.kind).includes(typeId) ? typeId : null
    } else if (typeId) {
      // No country: keep a type only if it exists somewhere, and let it set the side.
      const owner = GROUPS.find((g) => typeChoicesFor(g.country, g.kind).includes(typeId))
      if (owner) {
        kind = owner.kind
        type = typeId
        // A type only one country has places the line (an NRE account is in India).
        const countries = GROUPS.filter((g) => typeChoicesFor(g.country, g.kind).includes(typeId))
        if (countries.length === 1) country = owner.country
      }
    }

    const institution = str(a.institution, 60)
    const said = str(a.said, 200)
    const name =
      str(a.name, 48) ||
      [institution, type ? typeChoiceLabel(type) : 'account'].filter(Boolean).join(' ') ||
      'Account'
    const amount = num(a.amount)
    const currency =
      a.currency === 'USD' || a.currency === 'INR' ? a.currency : lineCurrency(country, type)

    const line: DraftLine = {
      id: newLineId(),
      country,
      kind,
      type,
      name,
      institution,
      amount: amount != null && amount > 0 ? amount : null,
      currency: amount != null && amount > 0 ? currency : lineCurrency(country, type),
      said: said || undefined,
    }
    const rate = num(a.interestRate)
    if (rate != null && rate > 0 && rate < 100) line.interestRate = rate
    if (typeof a.maturityDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.maturityDate)) line.maturityDate = a.maturityDate
    const pay = num(a.monthlyPayment)
    if (kind === 'liability' && pay != null && pay > 0) line.minPayment = pay

    // An India account with no type: nudge between the two likely picks.
    if (!type && country === 'IN' && kind === 'asset') {
      const words = `${said} ${name}`
      if (/\b(fds?|fixed deposits?|term deposits?)\b/i.test(words)) line.hint = 'fd'
      else if (/saving/i.test(words) || /\baccounts?\b/i.test(words)) line.hint = 'savings'
    }
    out.push(line)
  }
  return out
}
