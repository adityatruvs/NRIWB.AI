/**
 * Copilot actions — the structured "proposed change" protocol.
 *
 * The copilot never mutates anything itself. When the user asks to add or change
 * an account, goal, income, or budget category, the model appends a marker plus a
 * JSON array of *proposals* after its plain-text reply. The chat parses these and
 * renders each as an editable card the user can accept, edit, or discard — at
 * which point the existing context mutations apply it.
 */

import type { AccountType, AccountCountry } from '@/types/accounts'
import type { GoalCategory, GoalKind } from '@/lib/goals'

/** Marker that separates the conversational reply from the proposals JSON. */
export const PROPOSAL_SENTINEL = '[[PROPOSALS]]'

/** Wire shape of an account proposal (balance is in the country's own currency). */
export interface RawAccount {
  nickname?: string
  institution?: string
  accountType?: AccountType
  country?: AccountCountry
  balance?: number
  kind?: 'asset' | 'liability'
  isPfic?: boolean
  // Instrument-specific details — only the ones that fit the type are used.
  interestRate?: number
  expectedReturn?: number
  /** ISO YYYY-MM-DD. */
  maturityDate?: string
  compounding?: 'monthly' | 'quarterly' | 'half_yearly' | 'annually' | 'maturity'
  depositCurrency?: 'USD' | 'GBP' | 'EUR' | 'CAD' | 'AUD' | 'INR'
  tdsRate?: number
  fdScheme?: 'NRE' | 'NRO'
  isSgb?: boolean
  minPayment?: number
}

export interface RawGoal {
  name?: string
  category?: GoalCategory
  targetUsd?: number
  currentUsd?: number
  targetYear?: number
  kind?: GoalKind
}

/** A single proposal as emitted by the model (loosely typed; resolved client-side). */
export type RawProposal =
  | { type: 'add_account'; summary?: string; account?: RawAccount }
  | { type: 'update_account'; summary?: string; id?: string; account?: RawAccount }
  | { type: 'add_goal'; summary?: string; goal?: RawGoal }
  | { type: 'update_goal'; summary?: string; id?: string; goal?: RawGoal }
  | { type: 'set_income'; summary?: string; amount?: number }
  | { type: 'add_category'; summary?: string; label?: string; amount?: number }
  | { type: 'update_category'; summary?: string; id?: string; label?: string; amount?: number }

const PROPOSAL_TYPES = new Set([
  'add_account',
  'update_account',
  'add_goal',
  'update_goal',
  'set_income',
  'add_category',
  'update_category',
])

/**
 * Split a streamed assistant message into the visible reply and the proposals
 * tail (everything after the marker). Used both during streaming (to keep the
 * JSON hidden) and after it completes (to parse).
 */
export function splitProposals(text: string): { visible: string; tail: string } {
  const i = text.indexOf(PROPOSAL_SENTINEL)
  if (i === -1) return { visible: text, tail: '' }
  return { visible: text.slice(0, i).trimEnd(), tail: text.slice(i + PROPOSAL_SENTINEL.length) }
}

/** Parse the proposals tail into known proposal objects (tolerant; [] on failure). */
export function parseProposals(tail: string): RawProposal[] {
  const start = tail.indexOf('[')
  const end = tail.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []
  let arr: unknown
  try {
    arr = JSON.parse(tail.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  return arr.filter(
    (p): p is RawProposal =>
      !!p && typeof p === 'object' && typeof (p as { type?: unknown }).type === 'string' &&
      PROPOSAL_TYPES.has((p as { type: string }).type),
  )
}

/** Instructions appended to the copilot system prompt that teach it the protocol. */
export const ACTIONS_PROMPT = `ACTIONS — you can PROPOSE changes to the user's own data; you NEVER apply them yourself. When the user asks to add or change an account, a goal, their income, or a budget category, do BOTH:
1. Reply briefly in plain text (one or two sentences — what you're proposing and any detail you still need).
2. Then, on a new line, output the marker ${PROPOSAL_SENTINEL} followed by a single valid JSON array of proposal objects, as the LAST thing in your message. Output the marker ONLY when proposing a change — never for plain questions.

Proposal objects:
- {"type":"add_account","summary":"Add Amex HYSA — $10,000","account":{"nickname":"","institution":"","accountType":"<type>","country":"US"|"IN","balance":<number in that country's currency: USD for US, INR for IN>,"kind":"asset"|"liability","isPfic":false, ...type-specific detail fields...}}
- {"type":"update_account","summary":"...","id":"<ref from the accounts list>","account":{ ...only fields to change... }}

Account detail fields — include the ones that fit the type (with a real value or a sensible estimate; otherwise omit and the user fills it in):
- "interestRate" (% per year): savings/HYSA, nre, nro, fcnr, fd, cd, bond, notes_receivable, AND every loan (its APR). A US HYSA is accountType "savings" with an interestRate around 4–5.
- "expectedReturn" (% per year): growth assets — brokerage, 401k, ira, roth_ira, mutual_fund, real_estate, property, gold.
- "maturityDate" ("YYYY-MM-DD"): fd, cd, fcnr, bond, notes_receivable, and term loans (the payoff date).
- "minPayment" (per month, native currency): loans.
- "fdScheme": "NRE" or "NRO" for an India fd. "tdsRate" (%) for an India nro. "isPfic": true for an India mutual_fund. "isSgb": true for an India Sovereign Gold Bond.
- {"type":"add_goal","summary":"...","goal":{"name":"","category":"retirement|education|property|travel|emergency|other","targetUsd":<number>,"currentUsd":<number, optional>,"targetYear":<year>,"kind":"cost|investment"}}
- {"type":"update_goal","summary":"...","id":"<ref>","goal":{ ... }}
- {"type":"set_income","summary":"...","amount":<USD per month>}
- {"type":"add_category","summary":"...","label":"","amount":<USD per month>}
- {"type":"update_category","summary":"...","id":"<ref>","label":"","amount":<number>}

accountType is exactly one of: checking, savings, brokerage, 401k, ira, roth_ira, real_estate, property, nre, nro, fcnr, fd, mutual_fund, gold, vehicle, cd, bond, notes_receivable, other, mortgage, home_loan, heloc, auto_loan, student_loan, education_loan, personal_loan, credit_card, notes_payable, other_debt.

Rules:
- Propose the smallest set of changes that does what the user asked; multiple changes → multiple objects in the array.
- Use real numbers from the conversation. If a required detail is missing (e.g. the institution), set it to "" so the user fills it in the card, and say in your text what you need.
- Never propose deletions.
- For update_* / "id", use the "ref:" value shown next to each account and goal in the data above.
- The JSON array must be valid and the very last content in your message.`
