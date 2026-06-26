import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import {
  netWorth,
  byAssetClass,
  fbarStatus,
  pficHoldings,
  complianceItems,
  usdValue,
  TYPE_LABELS,
  FBAR_THRESHOLD_USD,
  FATCA_THRESHOLD_USD,
  type Holding,
  type ComplianceLevel,
} from '@/lib/portfolio'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
const MODEL = 'claude-sonnet-4-6'

interface InsightsRequest {
  holdings: Holding[]
  rate: number
}

interface Insight {
  key: string
  level: ComplianceLevel
  title: string
  detail: string
  meta: string
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

/** Compact, factual snapshot of the user's portfolio for the model to reason over. */
function buildContext(holdings: Holding[], rate: number): string {
  const nw = netWorth(holdings, rate)
  const fbar = fbarStatus(holdings, rate)
  const pfics = pficHoldings(holdings)
  const assets = byAssetClass(holdings, rate)

  const accountLines = holdings
    .map((h) => {
      const flags = [h.isPfic ? 'PFIC' : null, h.source !== 'manual' ? h.source : null].filter(Boolean)
      return `- [${h.country}] ${h.nickname} — ${h.institution}, ${TYPE_LABELS[h.accountType] ?? h.accountType}, ${usd(usdValue(h, rate))}${flags.length ? ` (${flags.join(', ')})` : ''}`
    })
    .join('\n')

  const assetLines = assets.map((a) => `- ${a.label}: ${usd(a.usd)} (${a.pct.toFixed(0)}%)`).join('\n')

  return `Net worth: ${usd(nw.totalUsd)} — US ${usd(nw.usUsd)} (${nw.usPct}%), India ${usd(nw.inUsd)} (${nw.inPct}%)
FX: 1 USD = ₹${rate.toFixed(2)}
FBAR: India accounts peaked at ${usd(fbar.peakUsd)} vs the ${usd(FBAR_THRESHOLD_USD)} threshold — ${fbar.crossed ? 'CROSSED, filing required' : `${Math.round(fbar.pctOfThreshold)}% of the limit`}
FATCA: Form 8938 threshold is ${usd(FATCA_THRESHOLD_USD)} in foreign (India) assets; user holds ${usd(nw.inUsd)} there
PFIC holdings: ${pfics.length > 0 ? pfics.map((p) => p.nickname).join(', ') : 'none'}

Asset allocation:
${assetLines}

Accounts (${holdings.length}):
${accountLines}`
}

const SYSTEM = `You are the NRIWB Wealth Copilot's insight engine. Given an NRI's (non-resident Indian) live cross-border portfolio, surface ONLY the things that genuinely need their attention right now — real US↔India tax/compliance obligations (FBAR/FinCEN 114, FATCA/Form 8938, PFIC/Form 8621, NRE/NRO tax, the 182-day residency rule, DTAA, repatriation) and material portfolio issues (allocation drift, concentration risk, cash drag, currency exposure).

Return ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"insights":[{"title":"...","detail":"...","meta":"...","level":"attention|overdue"}]}

Rules:
- Include an item ONLY if it is a genuine, actionable issue clearly supported by the data. Quality over quantity.
- If the portfolio is healthy and compliant, return FEWER items — and an empty array {"insights":[]} if nothing truly needs attention. NEVER pad to a target count, invent issues, or include reassurance/"all good" items.
- At most 6 items, ordered most-urgent first.
- "title": short label, e.g. "FBAR — FinCEN 114" or "India allocation drift". Max ~40 chars.
- "detail": one or two sentences grounded in the user's REAL numbers and account names. Max ~160 chars.
- "meta": the concrete next step or deadline, e.g. "Due Apr 15 (auto-ext. Oct 15)" or "Rebalance suggested". Max ~40 chars.
- "level": "overdue" for missed or required-now filings; "attention" for things to act on soon. If something is fine, simply omit it (do not return "ok" items).
- Be specific and useful. Never invent facts not supported by the data. You inform; you do not give personalized tax, legal, or investment advice.`

/** Loosely parse the model's JSON, tolerating stray prose or code fences. */
function parseInsights(text: string): Insight[] {
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) raw = fence[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no json object found')
  const obj = JSON.parse(raw.slice(start, end + 1)) as {
    insights?: Array<Partial<Insight>>
  }
  const levels: ComplianceLevel[] = ['ok', 'attention', 'overdue']
  return (obj.insights ?? [])
    .filter((it) => it && typeof it.title === 'string' && typeof it.detail === 'string')
    .slice(0, 6)
    .map((it, i) => ({
      key: `ai-${i}`,
      level: levels.includes(it.level as ComplianceLevel) ? (it.level as ComplianceLevel) : 'attention',
      title: String(it.title),
      detail: String(it.detail),
      meta: typeof it.meta === 'string' ? it.meta : '',
    }))
}

export async function POST(req: Request) {
  // Streams the user's portfolio to Anthropic (a subprocessor) — require auth.
  try {
    await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  let body: InsightsRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const holdings = Array.isArray(body.holdings) ? body.holdings : []
  const rate = body.rate || 83

  // Rule-based items are the always-available fallback if AI is unavailable.
  const fallback = (): Insight[] =>
    complianceItems(holdings, rate).map((c) => ({ ...c }))

  if (holdings.length === 0) {
    return Response.json({ insights: fallback(), source: 'fallback' })
  }

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildContext(holdings, rate) }],
    })
    const text = resp.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    // An empty array is a valid result — it means nothing needs attention.
    const insights = parseInsights(text)
    return Response.json({ insights, source: 'ai' })
  } catch (err) {
    console.error('Insights generation failed, using fallback:', err)
    return Response.json({ insights: fallback(), source: 'fallback' })
  }
}
