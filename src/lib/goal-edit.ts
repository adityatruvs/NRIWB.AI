/**
 * AI edits to an existing goal. The model returns only the fields the user asked
 * to change; everything else keeps its current value. Relative timing ("push it
 * out 5 years") is read from the text and applied here, so the model never does
 * the year arithmetic; so is an absolute one ("make it 2050", "when I turn 60").
 * Pure + testable.
 */

import type { GoalCategory, GoalKind } from '@/lib/goals'
import { goalTarget } from '@/lib/goal-amount'
import { formatUSD } from '@/lib/currency'

/** The goal as it stands in the form when the user asks for an edit. */
export interface GoalNow {
  name: string
  category: GoalCategory
  kind: GoalKind
  targetUsd: number
  targetYear: number
}

/** What the model may return for an edit: only the fields to change. */
export interface ModelGoalChanges {
  name?: string
  category?: GoalCategory
  kind?: GoalKind
  amount?: number
  currency?: 'USD' | 'INR'
  targetYear?: number
  /** Signed shift for relative timing, e.g. +5 for "5 years later". */
  yearsShift?: number
}

export type GoalPatch = Partial<GoalNow>

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}
const N = String.raw`(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)`
const num = (s: string) => WORDS[s.toLowerCase()] ?? Number(s)

/** Up to four words between a verb and its amount ("push my retirement out 5 years"). */
const GAP = String.raw`(?:\s+[\w']+){0,4}?`
const YEARS = String.raw`${N}\s+(?:more\s+)?years?\b`

/**
 * Shift patterns: the number must belong to the shift itself, so an age or any
 * other duration in the sentence ("I'm 35 years old", "move to India in 3 years")
 * is never read as the shift. Sign: +1 later, −1 earlier.
 */
const SHIFTS: [RegExp, 1 | -1][] = [
  // "push it out 5 years", "delay it by two years", "postpone a year"
  [new RegExp(String.raw`\b(?:push|delay|postpone|extend|defer)\b${GAP}\s+(?:(?:out|back)\s+)?(?:by\s+)?${YEARS}`, 'g'), 1],
  // "move it out 3 years", "shift it back 2 years"
  [new RegExp(String.raw`\b(?:move|shift)\b${GAP}\s+(?:out|back|later)\s+(?:by\s+)?${YEARS}`, 'g'), 1],
  // "3 years later"
  [new RegExp(String.raw`\b${YEARS}\s+later\b`, 'g'), 1],
  // "bring it forward two years", "move it up a year"
  [new RegExp(String.raw`\b(?:bring|move|shift|pull)\b${GAP}\s+(?:forward|up|ahead|earlier|sooner)\s+(?:by\s+)?${YEARS}`, 'g'), -1],
  // "pull it in by one year"
  [new RegExp(String.raw`\bpull\b${GAP}\s+in\s+(?:by\s+)?${YEARS}`, 'g'), -1],
  // "4 years earlier"
  [new RegExp(String.raw`\b${YEARS}\s+(?:earlier|sooner)\b`, 'g'), -1],
]

/**
 * A relative year shift stated in the text: "push my retirement out 5 years" → +5,
 * "3 years earlier" → −3, "bring it forward two years" → −2. Null when the text
 * states none, or two different ones (then the model decides).
 */
export function relativeYearShift(text: string): number | null {
  const t = text.toLowerCase()
  const shifts = new Set<number>()
  for (const [re, sign] of SHIFTS) {
    for (const m of t.matchAll(re)) {
      const n = num(m[1])
      if (Number.isFinite(n) && n > 0) shifts.add(sign * n)
    }
  }
  return shifts.size === 1 ? [...shifts][0] : null
}

/** Words that put the age in the text on someone else ("when my son turns 18"). */
const OTHER_PERSON = /\b(son|daughter|child|children|kid|kids|baby|grandchild|nephew|niece|brother|sister|spouse|wife|husband|partner|mom|mother|dad|father|parents?|he|she|his|her|they|their)\b/i

/**
 * An absolute target year stated in the text, or null when there's none (or it's
 * ambiguous). Reads:
 * - a calendar year: "make it 2050", "by 2050";
 * - the user's own age: "when I turn 60", "retire at 60" → currentYear + (60 − age),
 *   only when the age is known and no one else's age could be meant;
 * - a span from now: "in 12 years", "12 years from now" → currentYear + 12.
 */
export function absoluteTargetYear(text: string, currentYear: number, age: number | null): number | null {
  const t = text.toLowerCase()
  const found = new Set<number>()

  // Calendar years, not amounts ("$2050", "₹2050", "2050k").
  for (const m of t.matchAll(/(?<![$₹\d.,])\b(20\d{2}|2100)\b(?!\d|[.,]\d|\s*(?:k|m|l|cr|lakh|crore|usd|inr|dollars?|rupees?)\b)/g)) {
    found.add(Number(m[1]))
  }

  // The user's own age.
  if (age != null && !OTHER_PERSON.test(t)) {
    const ageRe = /\b(?:when i turn|i turn|when i(?:'m| am)|retire at|retiring at|retire by|by age|at age|at the age of|by the age of|when i reach)\s*(\d{2,3})\b(?!\s*(?:k|%|years?))/g
    for (const m of t.matchAll(ageRe)) found.add(currentYear + (Number(m[1]) - age))
  }

  // A span from now ("in 12 years", "12 years from now", "10 years out") — not a
  // shift ("push it out 5 years").
  if (relativeYearShift(text) == null) {
    const span = new RegExp(String.raw`\b(?:in|within)\s+${N}\s+years?\b|\b${N}\s+years?\s+(?:from\s+now|out)\b`, 'g')
    for (const m of t.matchAll(span)) found.add(currentYear + num(m[1] ?? m[2]))
  }

  const years = [...found].filter((y) => y >= currentYear && y <= currentYear + 100)
  return found.size === 1 && years.length === 1 ? years[0] : null
}

/**
 * The fields that change, from the model's reply checked against the text: an
 * explicit relative shift in the text wins over any year the model computed, and
 * an explicit rupee amount is converted at the app's rate.
 */
export function goalEditPatch(
  now: GoalNow,
  changes: ModelGoalChanges,
  description: string,
  rate: number,
  when: { currentYear: number; age: number | null },
): { patch: GoalPatch; conversion: string | null } {
  const patch: GoalPatch = {}
  let conversion: string | null = null

  // The text decides the year whenever it states one; the model only fills gaps.
  const shift = relativeYearShift(description)
  const absolute = shift == null ? absoluteTargetYear(description, when.currentYear, when.age) : null
  if (shift != null) patch.targetYear = now.targetYear + shift
  else if (absolute != null) patch.targetYear = absolute
  else if (changes.yearsShift != null) patch.targetYear = now.targetYear + Math.round(changes.yearsShift)
  else if (changes.targetYear != null) patch.targetYear = Math.round(changes.targetYear)

  if (changes.amount != null && changes.amount > 0) {
    const t = goalTarget(description, { amount: changes.amount, currency: changes.currency ?? 'USD' }, rate)
    patch.targetUsd = t.targetUsd
    conversion = t.conversion
  }
  if (changes.name?.trim()) patch.name = changes.name.trim().slice(0, 40)
  if (changes.category) patch.category = changes.category
  if (changes.kind) patch.kind = changes.kind

  // Drop no-op fields so the summary only lists real changes.
  for (const k of Object.keys(patch) as (keyof GoalNow)[]) if (patch[k] === now[k]) delete patch[k]
  return { patch, conversion }
}

/** "Target year 2046 → 2051", one clause per changed field, for the note. */
export function describePatch(now: GoalNow, patch: GoalPatch): string {
  const parts: string[] = []
  if (patch.targetYear != null) parts.push(`Target year ${now.targetYear} → ${patch.targetYear}`)
  if (patch.targetUsd != null) parts.push(`Target ${formatUSD(now.targetUsd)} → ${formatUSD(patch.targetUsd)}`)
  if (patch.name != null) parts.push(`Name "${now.name}" → "${patch.name}"`)
  if (patch.category != null) parts.push(`Category → ${patch.category}`)
  if (patch.kind != null) parts.push(`Type → ${patch.kind}`)
  return parts.length ? parts.join('; ') : 'No change'
}
