import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { AI_MODEL, AI_QUICK } from '@/lib/ai'
import { GOAL_CATEGORY_ORDER, type GoalCategory, type GoalKind } from '@/lib/goals'
import { goalTarget } from '@/lib/goal-amount'
import { absoluteTargetYear, goalEditPatch, describePatch, type GoalNow, type GoalPatch, type ModelGoalChanges } from '@/lib/goal-edit'
import { resolveRate } from '@/lib/user-context'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
const MODEL = AI_MODEL

interface SuggestRequest {
  /** Plain-language description, e.g. "fund my 8-year-old's US college". */
  description: string
  /** The current calendar year — the model dates the goal relative to it. */
  currentYear: number
  /** The user's age, if known — helps date retirement-type goals. */
  age?: number | null
  /** Country of residence (US/IN/OTHER) — anchors cost estimates. */
  country?: string | null
  /** The app's USD→INR rate (the one in the sidebar), for rupee amounts. */
  rate?: number
  /** Editing: the goal as it stands. The model then returns only what to change. */
  current?: GoalNow
}

/** The structured goal the model proposes; the form prefills from it. */
interface GoalSuggestion {
  name: string
  category: GoalCategory
  targetUsd: number
  targetYear: number
  kind: GoalKind
  /** One short sentence on how the amount + timing were estimated. */
  rationale: string
  /** How a rupee amount became `targetUsd`, at the app's rate. Null for dollars. */
  conversion: string | null
}

/** What the model returns: the amount in the currency the user wrote — it never converts. */
type ModelSuggestion = Omit<GoalSuggestion, 'targetUsd' | 'conversion'> & { amount: number; currency: 'USD' | 'INR' }

function buildSystem(currentYear: number, age: number | null, country: string | null): string {
  return `You turn a non-resident Indian's (NRI) plain-language money goal into one structured goal for a cross-border wealth app. Estimate a sensible target amount and the year it's needed, using the timing cues in the description.

Context:
- Current year: ${currentYear}
- User age: ${age ?? 'unknown'}
- Country of residence: ${country ?? 'unknown'}

Return ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"name":"...","category":"retirement|education|property|travel|emergency|other","amount":0,"currency":"USD|INR","targetYear":${currentYear},"kind":"cost|investment","rationale":"..."}

Rules:
- "category": one of retirement, education, property, travel, emergency, other.
- "kind": "cost" if reaching it SPENDS the money (education, travel, a wedding — it leaves their wealth); "investment" if it CONVERTS wealth and stays theirs (retirement pot, property, emergency fund).
- "targetYear": infer from timing cues. A child's US college starts at age ~18 → targetYear = ${currentYear} + (18 − child's current age). "In 5 years" → ${currentYear} + 5. Retirement → around age 65 if the user's age is known. Must be ≥ ${currentYear}.
- "amount" + "currency": NEVER convert between currencies — the app converts at its own live rate. When the description gives an explicit amount, return it in the currency it was written in, as a plain full number: ₹1.2 crore → amount 12000000, currency "INR"; ₹50 lakh → 5000000, "INR"; $150k → 150000, "USD". With no amount given, estimate one in USD: e.g. a 4-year US undergraduate degree ~150,000–280,000 USD total; Indian college far less; a US emergency fund ~3–6 months of typical expenses.
- "name": a short label (≤40 chars), e.g. "Aarav's US college".
- "rationale": ONE short sentence on the amount + timing assumptions. Max ~140 chars. Never mention an exchange rate or a converted figure (the app adds that line itself).
- Estimates are illustrative starting points the user will review and adjust — be reasonable, not precise.`
}

/** Editing an existing goal: change only what the user asks for. */
function buildEditSystem(currentYear: number, age: number | null, now: GoalNow): string {
  return `You edit ONE existing goal in a cross-border wealth app for a non-resident Indian (NRI). The user describes a change; return ONLY the fields they asked to change. Every field you leave out keeps its current value.

Context:
- Current year: ${currentYear}
- User age: ${age ?? 'unknown'}

The goal now:
${JSON.stringify(now)}

Return ONLY a JSON object, no prose and no code fences:
{"changes":{...only the changed fields...},"rationale":"..."}

Fields you may put in "changes" (include a field ONLY if the user asked to change it):
- "yearsShift": signed whole number for a RELATIVE timing change ("push it out 5 years" → 5, "3 years earlier" → -3). Do not compute the new year yourself.
- "targetYear": only for an ABSOLUTE new year ("make it 2050", "when I turn 60").
- "amount" + "currency": a new target, in the currency the user wrote it in (₹1.2 crore → 12000000, "INR"; $1.5M → 1500000, "USD"). Never convert currencies. "Double it" → the current targetUsd × 2 in USD.
- "name", "category" (retirement|education|property|travel|emergency|other), "kind" (cost|investment): only if asked.

Rules:
- Never re-estimate or "improve" a field the user didn't mention. "Push my retirement out 5 years" changes ONLY the timing: {"changes":{"yearsShift":5}}.
- "rationale": ONE short sentence on what you changed. Max ~140 chars. No arithmetic, exchange rates or converted figures.`
}

/** The JSON object in the model's reply, tolerating stray prose or code fences. */
function parseJsonObject(text: string): Record<string, unknown> {
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) raw = fence[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no json object found')
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
}

/** Only well-formed change fields survive; anything else the model sent is dropped. */
function parseChanges(obj: Record<string, unknown>): { changes: ModelGoalChanges; rationale: string } {
  const c = (obj.changes ?? {}) as Record<string, unknown>
  const changes: ModelGoalChanges = {}
  const n = (v: unknown) => (v == null || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined)
  if (n(c.yearsShift) != null) changes.yearsShift = n(c.yearsShift)
  if (n(c.targetYear) != null) changes.targetYear = n(c.targetYear)
  if (n(c.amount) != null) {
    changes.amount = n(c.amount)
    changes.currency = c.currency === 'INR' ? 'INR' : 'USD'
  }
  if (typeof c.name === 'string') changes.name = c.name
  if (GOAL_CATEGORY_ORDER.includes(c.category as GoalCategory)) changes.category = c.category as GoalCategory
  if (c.kind === 'cost' || c.kind === 'investment') changes.kind = c.kind
  return { changes, rationale: typeof obj.rationale === 'string' ? obj.rationale.slice(0, 160) : '' }
}

/** Loosely parse the model's JSON, tolerating stray prose or code fences. */
function parseSuggestion(text: string, currentYear: number): ModelSuggestion {
  const obj = parseJsonObject(text) as Partial<ModelSuggestion>

  const category: GoalCategory = GOAL_CATEGORY_ORDER.includes(obj.category as GoalCategory)
    ? (obj.category as GoalCategory)
    : 'other'
  const kind: GoalKind = obj.kind === 'investment' ? 'investment' : 'cost'
  const amount = Math.max(0, Number(obj.amount) || 0)
  const currency = obj.currency === 'INR' ? 'INR' : 'USD'
  const targetYear = Math.max(currentYear, Math.round(Number(obj.targetYear) || currentYear))

  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 40) : 'New goal',
    category,
    amount,
    currency,
    targetYear,
    kind,
    rationale: typeof obj.rationale === 'string' ? obj.rationale.slice(0, 160) : '',
  }
}

export async function POST(req: Request) {
  // Sends a short text description to Anthropic (a subprocessor) — require auth.
  try {
    await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  let body: SuggestRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!description) {
    return Response.json({ error: 'Describe your goal first' }, { status: 400 })
  }
  const currentYear =
    Number.isFinite(body.currentYear) && body.currentYear > 0 ? Math.round(body.currentYear) : 2026

  const now = parseGoalNow(body.current)
  if (now) return editGoal(description, now, currentYear, body)

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      ...AI_QUICK,
      system: buildSystem(currentYear, body.age ?? null, body.country ?? null),
      messages: [{ role: 'user', content: description.slice(0, 500) }],
    })
    const text = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const { amount, currency, ...rest } = parseSuggestion(text, currentYear)
    const rate = await resolveRate(body.rate)
    // A year the text states ("in 12 years", "by 2040", "when I turn 60") beats the model's.
    const targetYear = absoluteTargetYear(description, currentYear, body.age ?? null) ?? rest.targetYear
    const suggestion: GoalSuggestion = { ...rest, targetYear, ...goalTarget(description, { amount, currency }, rate) }
    return Response.json({ suggestion })
  } catch (err) {
    console.error('Goal suggestion failed:', err)
    return Response.json({ error: 'Could not reach the assistant. Try again.' }, { status: 502 })
  }
}

/** The current goal from the request, or null when it isn't a well-formed one. */
function parseGoalNow(v: unknown): GoalNow | null {
  const g = v as Partial<GoalNow> | null | undefined
  if (!g || typeof g !== 'object') return null
  if (typeof g.name !== 'string' || !GOAL_CATEGORY_ORDER.includes(g.category as GoalCategory)) return null
  if (!Number.isFinite(g.targetUsd) || !Number.isFinite(g.targetYear)) return null
  return {
    name: g.name,
    category: g.category as GoalCategory,
    kind: g.kind === 'investment' ? 'investment' : 'cost',
    targetUsd: Number(g.targetUsd),
    targetYear: Math.round(Number(g.targetYear)),
  }
}

/** Edit mode: the reply carries only the changed fields, plus a plain summary of them. */
async function editGoal(description: string, now: GoalNow, currentYear: number, body: SuggestRequest) {
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      ...AI_QUICK,
      system: buildEditSystem(currentYear, body.age ?? null, now),
      messages: [{ role: 'user', content: description.slice(0, 500) }],
    })
    const text = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const { changes, rationale } = parseChanges(parseJsonObject(text))
    const rate = await resolveRate(body.rate)
    const { patch, conversion } = goalEditPatch(now, changes, description, rate, { currentYear, age: body.age ?? null })
    const edit: { patch: GoalPatch; summary: string; conversion: string | null; rationale: string } = {
      patch,
      summary: describePatch(now, patch),
      conversion,
      rationale,
    }
    return Response.json({ edit })
  } catch (err) {
    console.error('Goal edit suggestion failed:', err)
    return Response.json({ error: 'Could not reach the assistant. Try again.' }, { status: 502 })
  }
}
