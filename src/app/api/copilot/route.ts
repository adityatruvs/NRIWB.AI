import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import {
  netWorth,
  fbarStatus,
  pficHoldings,
  complianceItems,
  usdValue,
  isLiability,
  loansSecuredBy,
  assetEquity,
  TYPE_LABELS,
  FBAR_THRESHOLD_USD,
  FATCA_THRESHOLD_USD,
  type Holding,
} from '@/lib/portfolio'
import { portfolioExpectedReturn, expectedReturn } from '@/lib/allocation'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

const MODEL = 'claude-sonnet-4-6'
const MAX_HISTORY = 20

interface WireMessage {
  role: 'user' | 'assistant'
  text: string
}

interface CopilotRequest {
  messages: WireMessage[]
  holdings: Holding[]
  rate: number
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

/**
 * Grounds the copilot in the user's live portfolio. Recomputed server-side
 * from the posted holdings so the model always sees the same numbers the
 * dashboard renders.
 */
function buildSystemPrompt(holdings: Holding[], rate: number): string {
  const nw = netWorth(holdings, rate)
  const fbar = fbarStatus(holdings, rate)
  const pfics = pficHoldings(holdings)
  const compliance = complianceItems(holdings, rate)

  // Balance-weighted expected return from the user's own accounts (each grows at
  // its contractual or estimated rate). Lets the copilot answer "what will my net
  // worth be in N years" instead of refusing for lack of a growth assumption.
  const blendedR = portfolioExpectedReturn(holdings, rate)

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
      const rtn = isLiability(h) ? '' : `, ~${(expectedReturn(h) * 100).toFixed(1)}%/yr`
      return `- [${h.country}] ${h.nickname} — ${h.institution}, ${TYPE_LABELS[h.accountType] ?? h.accountType}, ${usd(usdValue(h, rate))}${rtn}${flags.length ? ` (${flags.join(', ')})` : ''}${extra}`
    })
    .join('\n')

  // Illustrative net-worth path: assets compound at the blended rate, debts held
  // flat, no new contributions. The copilot can cite or refine these.
  const projLines =
    blendedR != null
      ? [1, 2, 3, 5, 10]
          .map((y) => `- ${y}yr: ${usd(nw.assetsUsd * Math.pow(1 + blendedR, y) - nw.liabilitiesUsd)}`)
          .join('\n')
      : null

  const complianceLines = compliance
    .map((c) => `- ${c.title}: [${c.level}] ${c.detail} (${c.meta})`)
    .join('\n')

  return `You are the NRIWB Wealth Copilot — a cross-border personal-finance assistant for NRIs (non-resident Indians) managing money in both the United States and India. You explain US↔India tax and compliance topics (FBAR/FinCEN 114, FATCA/Form 8938, PFIC/Form 8621, NRE/NRO/FCNR accounts, DTAA, the 182-day residency rule, repatriation) in plain English, grounded in the user's actual portfolio below.

<portfolio>
Net worth: ${usd(nw.totalUsd)} total — US ${usd(nw.usUsd)} (${nw.usPct}%), India ${usd(nw.inUsd)} (${nw.inPct}%)${nw.liabilitiesUsd > 0 ? `\n(${usd(nw.assetsUsd)} in assets less ${usd(nw.liabilitiesUsd)} in liabilities)` : ''}
Blended expected return: ${blendedR != null ? `${(blendedR * 100).toFixed(1)}%/yr — balance-weighted from each account's own contractual or estimated rate` : 'n/a (no assets yet)'}${
    projLines
      ? `\nIllustrative net-worth path (assets compound at the blended rate, debts held flat, no new contributions):\n${projLines}`
      : ''
  }
FX rate: 1 USD = ₹${rate.toFixed(2)}
FBAR: India accounts peaked at ~${usd(fbar.peakUsd)} vs the ${usd(FBAR_THRESHOLD_USD)} threshold — ${fbar.crossed ? 'CROSSED, filing required' : `${Math.round(fbar.pctOfThreshold)}% of the limit`}
FATCA: Form 8938 reporting threshold is ${usd(FATCA_THRESHOLD_USD)} in foreign assets
PFIC holdings: ${pfics.length > 0 ? pfics.map((p) => p.nickname).join(', ') : 'none'}

Accounts (${holdings.length}):
${accountLines}

Compliance status:
${complianceLines}
</portfolio>

Guidelines:
- Reference the user's real numbers and account names when they're relevant — that's your main value over a generic chatbot.
- Be concise: a few short paragraphs or a tight bullet list. This renders in a small chat panel.
- Formatting is limited: plain text, **bold** for emphasis, and lines starting with "•" for bullets. No headers, tables, links, LaTeX, or nested lists.
- You explain and inform; you do not give personalized tax, legal, or investment advice. For filings or elections (e.g. QEF vs mark-to-market), explain the options and recommend confirming with a cross-border CPA.
- When asked to project or predict net worth, DO answer using the blended expected return and illustrative path above — they're derived from the user's own accounts. Always label it illustrative, state the assumptions (no new contributions, debts held flat), and note that real returns vary year to year. If they give a different rate or savings rate, recompute from it.
- If asked something outside cross-border personal finance, answer briefly and steer back to what you can help with.`
}

export async function POST(req: Request) {
  // The copilot streams the user's portfolio to Anthropic — require an authenticated
  // session even though the UI is already gated (defense in depth: the endpoint is
  // directly reachable). Anthropic is a subprocessor; disclose this in the privacy policy.
  try {
    await requireUserId()
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized()
    throw e
  }

  let body: CopilotRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const history = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_HISTORY)

  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return Response.json({ error: 'Last message must be from the user' }, { status: 400 })
  }

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: 'adaptive' },
    system: buildSystemPrompt(body.holdings ?? [], body.rate || 83),
    messages: history.map((m): Anthropic.MessageParam => ({ role: m.role, content: m.text })),
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('text', (delta) => controller.enqueue(encoder.encode(delta)))
      stream
        .finalMessage()
        .then(() => controller.close())
        .catch((err: unknown) => {
          console.error('Copilot stream error:', err)
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
