import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { netWorth, type Holding } from '@/lib/portfolio'
import {
  recommendedAllocation,
  currentAllocation,
  activeBuckets,
  BUCKET_META,
  RISK_META,
  type Allocation,
  type RiskLevel,
} from '@/lib/allocation'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
const MODEL = 'claude-sonnet-4-6'

interface AnalyzerRequest {
  age: number
  risk: RiskLevel
  includeRealEstate: boolean
  /** The user's (possibly hand-adjusted) target split, in percent. */
  target: Allocation
  holdings: Holding[]
  rate: number
  /** Optional monthly income in USD — used to reason about savings capacity. */
  monthlyIncome?: number
}

const pct = (n: number) => `${Math.round(n)}%`
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function buildSystemPrompt(body: AnalyzerRequest): string {
  const { age, risk, includeRealEstate, target, holdings, rate, monthlyIncome } = body
  const buckets = activeBuckets(includeRealEstate)
  const nw = netWorth(holdings, rate)
  const rec = recommendedAllocation(age, risk, includeRealEstate)
  const current = currentAllocation(holdings, rate, includeRealEstate)
  const currentPct = new Map(current.slices.map((s) => [s.key, s.pct]))

  const line = (b: (typeof buckets)[number]) =>
    `- ${BUCKET_META[b].label}: recommended ${pct(rec[b])}, your target ${pct(target[b] ?? rec[b])}, currently held ${pct(currentPct.get(b) ?? 0)}`

  return `You are the Portfolio Analyzer inside NRIWB, a cross-border wealth app. You explain a *rule-based* recommended asset allocation in plain, encouraging English. The percentages were computed by a deterministic engine (an age glide-path plus a risk dial) — you do NOT change them, you explain the reasoning and the gap between where the user is and where the model suggests.

<profile>
Age: ${age} · Risk appetite: ${RISK_META[risk].label}
Investable base analysed: ${usd(current.totalUsd)} (of ${usd(nw.totalUsd)} total net worth)
Primary home: ${includeRealEstate ? 'INCLUDED in this analysis' : 'EXCLUDED — only liquid/investable assets analysed'}
${monthlyIncome && monthlyIncome > 0 ? `Monthly income: ${usd(monthlyIncome)} (~${usd(monthlyIncome * 12)}/yr)` : 'Monthly income: not provided'}
</profile>

<allocation>
${buckets.map(line).join('\n')}
</allocation>

How to respond:
- Open with one sentence on the big picture for someone this age + risk level (e.g. why equities dominate when young).
- Then 2–4 short bullets: the reasoning behind the largest buckets, and the most important rebalancing move (the biggest gap between "currently held" and "your target"). Quote the real dollar amounts where useful.
- If the user's target differs a lot from the recommendation, acknowledge it neutrally — it's their portfolio.
- If monthly income is provided, briefly factor it in: their savings capacity, and whether their cash/banking holdings cover roughly 3–6 months of income as an emergency fund.
- Be concise (renders in a side panel). Plain text only: **bold** for emphasis and lines starting with "•" for bullets. No headers, tables, or links.
- End by reminding them this is an educational guideline, not personalized financial advice.`
}

export async function POST(req: Request) {
  try {
    await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  let body: AnalyzerRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.age !== 'number' || !body.target) {
    return Response.json({ error: 'Missing age or target allocation' }, { status: 400 })
  }

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: buildSystemPrompt(body),
    messages: [
      { role: 'user', content: 'Explain my recommended allocation and the most important move to make.' },
    ],
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('text', (delta) => controller.enqueue(encoder.encode(delta)))
      stream
        .finalMessage()
        .then(() => controller.close())
        .catch((err: unknown) => {
          console.error('Analyzer stream error:', err)
          controller.error(err)
        })
    },
    cancel() {
      stream.abort()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
