import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { AI_MODEL, AI_QUICK } from '@/lib/ai'
import {
  netWorth,
  byAssetClass,
  fbarStatus,
  pficHoldings,
  complianceItems,
  usdValue,
  isLiability,
  loansSecuredBy,
  assetEquity,
  TYPE_LABELS,
  FBAR_THRESHOLD_USD,
  fbarBasisPhrase,
  FATCA_THRESHOLD_USD,
  type Holding,
  type ComplianceLevel,
} from '@/lib/portfolio'

import { loadUserContext, parseRate } from '@/lib/user-context'
import { ATTENTION_KEYS, isAttentionKey, withHrefs } from '@/lib/attention-links'
import { recordedFbarPeak, type FbarSnapshot } from '@/lib/fbar'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
const MODEL = AI_MODEL

/** Only the demo flag and (until the FX service) the rate; data is loaded server-side. */
interface InsightsRequest {
  rate?: number
  demo?: boolean
}

interface Insight {
  key: string
  level: ComplianceLevel
  title: string
  detail: string
  meta: string
  href?: string
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

/** Compact, factual snapshot of the user's portfolio for the model to reason over. */
function buildContext(holdings: Holding[], rate: number, fbarSnapshots: FbarSnapshot[]): string {
  const nw = netWorth(holdings, rate)
  const fbar = fbarStatus(holdings, rate, recordedFbarPeak(holdings, fbarSnapshots, rate, new Date().getUTCFullYear()))
  const pfics = pficHoldings(holdings)
  const assets = byAssetClass(holdings, rate)
  // FATCA reports gross foreign assets, not net of India debt.
  const indiaAssetsUsd = holdings
    .filter((h) => h.country === 'IN' && !isLiability(h))
    .reduce((s, h) => s + h.balanceInr / rate, 0)

  const accountLines = holdings
    .map((h) => {
      const flags = [isLiability(h) ? 'DEBT' : null, h.isPfic ? 'PFIC' : null, h.source !== 'manual' ? h.source : null].filter(Boolean)
      let extra = ''
      if (isLiability(h) && h.securedAgainstId) {
        const asset = holdings.find((a) => a.id === h.securedAgainstId)
        if (asset) extra = ` — secured by ${asset.nickname}`
      } else if (!isLiability(h) && loansSecuredBy(h.id, holdings).length > 0) {
        extra = ` — ${usd(assetEquity(h, holdings, rate))} equity after loans`
      }
      return `- [${h.country}] ${h.nickname} — ${h.institution}, ${TYPE_LABELS[h.accountType] ?? h.accountType}, ${usd(usdValue(h, rate))}${flags.length ? ` (${flags.join(', ')})` : ''}${extra}`
    })
    .join('\n')

  const assetLines = assets.map((a) => `- ${a.label}: ${usd(a.usd)} (${a.pct.toFixed(0)}%)`).join('\n')

  return `Net worth: ${usd(nw.totalUsd)} — US ${usd(nw.usUsd)} (${nw.usPct}%), India ${usd(nw.inUsd)} (${nw.inPct}%)${nw.liabilitiesUsd > 0 ? `\nGross: ${usd(nw.assetsUsd)} assets less ${usd(nw.liabilitiesUsd)} liabilities` : ''}
FX: 1 USD = ₹${rate.toFixed(2)}
FBAR: ${fbarBasisPhrase(fbar)}${fbar.basis === 'current' ? ' (no balance history recorded this year, so the true yearly maximum is unknown and may be higher)' : ''} vs the ${usd(FBAR_THRESHOLD_USD)} threshold — ${fbar.crossed ? 'CROSSED, filing required' : `${Math.round(fbar.pctOfThreshold)}% of the limit`}
FATCA: Form 8938 threshold is ${usd(FATCA_THRESHOLD_USD)} in foreign (India) assets; user holds ${usd(indiaAssetsUsd)} there
PFIC holdings: ${pfics.length > 0 ? pfics.map((p) => p.nickname).join(', ') : 'none'}

Asset allocation:
${assetLines}

Accounts (${holdings.length}):
${accountLines}`
}

const SYSTEM = `You are the NRIWB Wealth Copilot's insight engine. Given an NRI's (non-resident Indian) live cross-border portfolio, surface ONLY the things that genuinely need their attention right now — real US↔India tax/compliance obligations (FBAR/FinCEN 114, FATCA/Form 8938, PFIC/Form 8621, NRE/NRO tax, the 182-day residency rule, DTAA, repatriation) and material portfolio issues (allocation drift, concentration risk, cash drag, currency exposure).

Return ONLY a JSON object, no prose and no code fences, in exactly this shape:
{"insights":[{"key":"...","title":"...","detail":"...","meta":"...","level":"attention|overdue"}]}

Rules:
- Include an item ONLY if it is a genuine, actionable issue clearly supported by the data. Quality over quantity.
- If the portfolio is healthy and compliant, return FEWER items — and an empty array {"insights":[]} if nothing truly needs attention. NEVER pad to a target count, invent issues, or include reassurance/"all good" items.
- At most 6 items, ordered most-urgent first.
- "key": the topic, exactly one of ${ATTENTION_KEYS.join(', ')}; or "other" when none fits. The app turns the key into a link to where the user fixes it.
- "title": short label, e.g. "FBAR — FinCEN 114" or "India allocation drift". Max ~40 chars.
- "detail": one or two sentences grounded in the user's REAL numbers and account names. Max ~160 chars.
- "meta": the concrete next step or deadline, e.g. "Due Apr 15 (auto-ext. Oct 15)" or "Rebalance suggested". Max ~40 chars.
- "level": "overdue" for missed or required-now filings; "attention" for things to act on soon. If something is fine, simply omit it (do not return "ok" items).
- FBAR figures: use ONLY the FBAR line above. Never state, estimate or round up a "peak" or "maximum" balance that isn't given there. When it says current balances, call it the current balance and note that FBAR counts each account's highest balance during the year, which the app hasn't recorded.
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
      // Keep the topic key when it's one we know (it drives the link); otherwise
      // a unique placeholder that maps to no route.
      key: isAttentionKey(it.key) ? it.key : `ai-${i}`,
      level: levels.includes(it.level as ComplianceLevel) ? (it.level as ComplianceLevel) : 'attention',
      title: String(it.title),
      detail: String(it.detail),
      meta: typeof it.meta === 'string' ? it.meta : '',
    }))
}

/**
 * The FBAR figure is a legal-filing number, so its wording never comes from the
 * model: any FBAR item (by key or title) gets the app's own sentence, built only
 * from recorded balances, in place of whatever the model wrote.
 */
function pinFbar(items: Insight[], rule: Insight | undefined): Insight[] {
  if (!rule) return items
  return items.map((it) =>
    it.key === 'fbar' || /\bFBAR\b|FinCEN/i.test(it.title)
      ? { ...it, key: 'fbar', detail: rule.detail, level: rule.level === 'ok' ? it.level : rule.level }
      : it,
  )
}

/** Two items on one topic would share a React key: suffix the repeats (after hrefs are set). */
function uniqueKeys(items: Insight[]): Insight[] {
  const seen = new Map<string, number>()
  return items.map((it) => {
    const n = seen.get(it.key) ?? 0
    seen.set(it.key, n + 1)
    return n === 0 ? it : { ...it, key: `${it.key}-${n + 1}` }
  })
}

export async function POST(req: Request) {
  // Streams the user's portfolio to Anthropic (a subprocessor) — require auth.
  let userId: string
  try {
    userId = await requireUserId()
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

  const rate = parseRate(body.rate)
  let holdings: Holding[]
  let fbarSnapshots: FbarSnapshot[]
  try {
    ;({ holdings, fbarSnapshots } = await loadUserContext(userId, { demo: body.demo === true }))
  } catch (err) {
    console.error('Insights context load failed:', err)
    return Response.json({ insights: [], source: 'fallback' })
  }

  // Rule-based items are the always-available fallback if AI is unavailable.
  const recorded = recordedFbarPeak(holdings, fbarSnapshots, rate, new Date().getUTCFullYear())
  const fallback = (): Insight[] => withHrefs(complianceItems(holdings, rate, recorded), holdings)

  if (holdings.length === 0) {
    return Response.json({ insights: fallback(), source: 'fallback' })
  }

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      ...AI_QUICK,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildContext(holdings, rate, fbarSnapshots) }],
    })
    const text = resp.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    // An empty array is a valid result — it means nothing needs attention.
    const fbarRule = complianceItems(holdings, rate, recorded).find((c) => c.key === 'fbar')
    const insights = uniqueKeys(withHrefs(pinFbar(parseInsights(text), fbarRule), holdings))
    return Response.json({ insights, source: 'ai' })
  } catch (err) {
    console.error('Insights generation failed, using fallback:', err)
    return Response.json({ insights: fallback(), source: 'fallback' })
  }
}
