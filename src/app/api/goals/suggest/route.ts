import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { GOAL_CATEGORY_ORDER, type GoalCategory, type GoalKind } from '@/lib/goals'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
const MODEL = 'claude-sonnet-4-6'

interface SuggestRequest {
  /** Plain-language description, e.g. "fund my 8-year-old's US college". */
  description: string
  /** The current calendar year — the model dates the goal relative to it. */
  currentYear: number
  /** The user's age, if known — helps date retirement-type goals. */
  age?: number | null
  /** Country of residence (US/IN/OTHER) — anchors cost estimates. */
  country?: string | null
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
}

function buildSystem(currentYear: number, age: number | null, country: string | null): string {
  return `You turn a non-resident Indian's (NRI) plain-language money goal into one structured goal for a cross-border wealth app. Estimate a sensible target amount (USD) and the year it's needed, using the timing cues in the description.

Context:
- Current year: ${currentYear}
- User age: ${age ?? 'unknown'}
- Country of residence: ${country ?? 'unknown'}

Return ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"name":"...","category":"retirement|education|property|travel|emergency|other","targetUsd":0,"targetYear":${currentYear},"kind":"cost|investment","rationale":"..."}

Rules:
- "category": one of retirement, education, property, travel, emergency, other.
- "kind": "cost" if reaching it SPENDS the money (education, travel, a wedding — it leaves their wealth); "investment" if it CONVERTS wealth and stays theirs (retirement pot, property, emergency fund).
- "targetYear": infer from timing cues. A child's US college starts at age ~18 → targetYear = ${currentYear} + (18 − child's current age). "In 5 years" → ${currentYear} + 5. Retirement → around age 65 if the user's age is known. Must be ≥ ${currentYear}.
- "targetUsd": a realistic estimate for the context. E.g. a 4-year US undergraduate degree ~150,000–280,000 USD total; Indian college far less; a US emergency fund ~3–6 months of typical expenses. State your assumption briefly in "rationale". When the description gives an explicit amount, use it.
- "name": a short label (≤40 chars), e.g. "Aarav's US college".
- "rationale": ONE short sentence on the amount + timing assumptions. Max ~140 chars.
- Estimates are illustrative starting points the user will review and adjust — be reasonable, not precise.`
}

/** Loosely parse the model's JSON, tolerating stray prose or code fences. */
function parseSuggestion(text: string, currentYear: number): GoalSuggestion {
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) raw = fence[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no json object found')
  const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<GoalSuggestion>

  const category: GoalCategory = GOAL_CATEGORY_ORDER.includes(obj.category as GoalCategory)
    ? (obj.category as GoalCategory)
    : 'other'
  const kind: GoalKind = obj.kind === 'investment' ? 'investment' : 'cost'
  const targetUsd = Math.max(0, Math.round(Number(obj.targetUsd) || 0))
  const targetYear = Math.max(currentYear, Math.round(Number(obj.targetYear) || currentYear))

  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 40) : 'New goal',
    category,
    targetUsd,
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

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: buildSystem(currentYear, body.age ?? null, body.country ?? null),
      messages: [{ role: 'user', content: description.slice(0, 500) }],
    })
    const text = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const suggestion = parseSuggestion(text, currentYear)
    return Response.json({ suggestion })
  } catch (err) {
    console.error('Goal suggestion failed:', err)
    return Response.json({ error: 'Could not reach the assistant. Try again.' }, { status: 502 })
  }
}
