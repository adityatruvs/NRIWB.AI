import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
const MODEL = 'claude-sonnet-4-6'

interface PlanRequest {
  /** Plain-language description, e.g. "retire at 60 with $100k/year". */
  description: string
  /** Everything below is pulled from elsewhere — the model grounds in it, never asks. */
  currentAge: number
  /** Investable savings today (USD) — from the user's accounts. */
  savingsUsd: number
  /** Current monthly investing (USD) — from the budget's invest categories. */
  monthlyContribution: number
  /** Expected annual return, percent — balance-weighted from the real accounts. */
  expectedReturnPct: number
  /** Safe withdrawal rate, percent (the "4% rule"). */
  safeWithdrawalPct: number
}

/** The structured plan the model proposes; the analyzer prefills from it. */
interface RetirementPlan {
  retireAge: number
  targetUsd: number
  /**
   * The annual return assumption to use, percent. Defaults to their grounded
   * account rate; the model only changes it if the description states one
   * (e.g. "assuming 8% growth").
   */
  expectedReturnPct: number
  /**
   * Yearly step-up in the monthly contribution, percent (e.g. 5 = "invest 5%
   * more each year than the last"). 0 unless the description states one.
   */
  contribGrowthPct: number
  /** One or two short sentences: how the target was derived + a feasibility read. */
  rationale: string
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function buildSystem(b: PlanRequest): string {
  return `You help a non-resident Indian (NRI) set their retirement plan in a cross-border wealth app. From a plain-language description, infer two things: the AGE they want to retire and the savings TARGET (USD) they need by then.

Their actual finances are already known — NEVER ask for these, ground your reasoning in them:
- Current age: ${b.currentAge}
- Investable savings today: ${usd(b.savingsUsd)}
- Investing now: ${usd(b.monthlyContribution)}/mo
- Expected return: ${b.expectedReturnPct.toFixed(1)}%/yr (from their real accounts)
- Safe withdrawal rate: ${b.safeWithdrawalPct.toFixed(0)}% (the "4% rule")

Return ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"retireAge":65,"targetUsd":0,"expectedReturnPct":${b.expectedReturnPct.toFixed(1)},"contribGrowthPct":0,"rationale":"..."}

Rules:
- "retireAge": the age they stop working. Infer from the description; if only "early" or "comfortable" is implied, pick a sensible age relative to their current age (${b.currentAge}). Must be greater than ${b.currentAge} and at most 90.
- "targetUsd": the lump sum needed at retirement.
  • Explicit lump sum ("$3M") → use it.
  • Desired retirement INCOME ("$100k/year", "$8k/month") → convert with the safe-withdrawal rate: target = annual income ÷ (${b.safeWithdrawalPct.toFixed(0)} / 100). Say so in the rationale.
  • Only a lifestyle described → estimate a reasonable annual retirement income for their context and convert it the same way.
- "expectedReturnPct": the annual return to assume. Default to their grounded rate of ${b.expectedReturnPct.toFixed(1)}. ONLY change it if the description explicitly states a return expectation (e.g. "assuming 8%", "at 10%/yr", "10% yoy"). Keep it between 0 and 40.
- "contribGrowthPct": a yearly step-up in the monthly contribution. 0 by default; set it only if the description states one (e.g. "5% increase in monthly contribution", "raise contributions 5% a year"). Keep it between 0 and 25.
- "rationale": ONE or two short sentences. State how you got the target (especially any income→lump conversion). Then a quick read on the MONTHLY INVESTING the plan implies: the app will solve and fill the contribution needed to hit the target by ${b.currentAge >= 0 ? 'that age' : 'retirement'} from their ${usd(b.savingsUsd)} at the return — say whether that required investing looks easy, a stretch, or a big lift versus their current ${usd(b.monthlyContribution)}/mo. Be directional, not precise. Max ~200 chars.
- These are starting points the user reviews and adjusts.`
}

/** Loosely parse the model's JSON, tolerating stray prose or code fences. */
function parsePlan(text: string, currentAge: number, fallbackReturnPct: number): RetirementPlan {
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) raw = fence[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no json object found')
  const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<RetirementPlan>

  const retireAge = Math.min(90, Math.max(currentAge + 1, Math.round(Number(obj.retireAge) || currentAge + 1)))
  const targetUsd = Math.max(0, Math.round(Number(obj.targetUsd) || 0))
  const expectedReturnPct = Math.min(40, Math.max(0, Number(obj.expectedReturnPct) || fallbackReturnPct))
  const contribGrowthPct = Math.min(25, Math.max(0, Math.round(Number(obj.contribGrowthPct) || 0)))
  return {
    retireAge,
    targetUsd,
    expectedReturnPct,
    contribGrowthPct,
    rationale: typeof obj.rationale === 'string' ? obj.rationale.slice(0, 240) : '',
  }
}

export async function POST(req: Request) {
  // Sends a short description + grounding numbers to Anthropic (a subprocessor) — require auth.
  try {
    await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  let body: PlanRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!description) {
    return Response.json({ error: 'Describe your retirement first' }, { status: 400 })
  }
  const currentAge =
    Number.isFinite(body.currentAge) && body.currentAge > 0 ? Math.round(body.currentAge) : 30

  // Defensive defaults so the prompt never reads NaN if a field is missing.
  const grounded: PlanRequest = {
    description,
    currentAge,
    savingsUsd: Math.max(0, Number(body.savingsUsd) || 0),
    monthlyContribution: Math.max(0, Number(body.monthlyContribution) || 0),
    expectedReturnPct: Number.isFinite(body.expectedReturnPct) ? Number(body.expectedReturnPct) : 6,
    safeWithdrawalPct: Number.isFinite(body.safeWithdrawalPct) ? Number(body.safeWithdrawalPct) : 4,
  }

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: buildSystem(grounded),
      messages: [{ role: 'user', content: description.slice(0, 500) }],
    })
    const text = resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const plan = parsePlan(text, currentAge, grounded.expectedReturnPct)
    return Response.json({ plan })
  } catch (err) {
    console.error('Retirement plan failed:', err)
    return Response.json({ error: 'Could not reach the assistant. Try again.' }, { status: 502 })
  }
}
