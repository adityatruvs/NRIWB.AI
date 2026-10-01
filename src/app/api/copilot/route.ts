import Anthropic from '@anthropic-ai/sdk'
import { requireUserId, unauthorized, UnauthorizedError } from '@/lib/auth'
import { AI_MODEL } from '@/lib/ai'
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
  ownershipLabel,
  FBAR_THRESHOLD_USD,
  fbarBasisPhrase,
  FATCA_THRESHOLD_USD,
  type Holding,
} from '@/lib/portfolio'
import { portfolioExpectedReturn, expectedReturn } from '@/lib/allocation'
import { resolveGoal, goalKind, type Goal } from '@/lib/goals'
import { ACTIONS_PROMPT } from '@/lib/copilot-actions'
import { loadUserContext, parseRate } from '@/lib/user-context'
import { recordedFbarPeak, type FbarSnapshot } from '@/lib/fbar'

export const runtime = 'nodejs'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

const MODEL = AI_MODEL
const MAX_HISTORY = 20

interface WireMessage {
  role: 'user' | 'assistant'
  text: string
}

/**
 * The request carries only the conversation, the demo flag and (until the FX
 * service lands) the rate. The user's financial data is loaded server-side —
 * anything else in the body is ignored.
 */
interface CopilotRequest {
  messages: WireMessage[]
  rate?: number
  demo?: boolean
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

/**
 * Grounds the copilot in the user's stored portfolio, goals and budget (see
 * loadUserContext), computed with the same selectors the dashboard renders.
 */
function buildSystemPrompt(
  holdings: Holding[],
  rate: number,
  income: number,
  monthlyContribution: number,
  age: number | null,
  goals: Goal[],
  fbarSnapshots: FbarSnapshot[],
): string {
  const nw = netWorth(holdings, rate)
  const fbar = fbarStatus(holdings, rate, recordedFbarPeak(holdings, fbarSnapshots, rate, new Date().getUTCFullYear()))
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
      const owner = ownershipLabel(h)
      if (owner) extra += h.ownership === 'family' ? ` — held in name of ${owner}` : ` — joint: ${owner}`
      const rtn = isLiability(h) ? '' : `, ~${(expectedReturn(h) * 100).toFixed(1)}%/yr`
      return `- [${h.country}] ${h.nickname} — ${h.institution}, ${TYPE_LABELS[h.accountType] ?? h.accountType}, ${usd(usdValue(h, rate))}${rtn}${flags.length ? ` (${flags.join(', ')})` : ''}${extra}${h.id ? ` [ref: ${h.id}]` : ''}`
    })
    .join('\n')

  // Illustrative net-worth path: assets compound at the blended rate, debts held
  // flat, PLUS the user's monthly contributions (from their budget). This is the
  // same basis the Analyzer projects on, so the copilot agrees with it.
  const contribAnnual = monthlyContribution > 0 ? monthlyContribution * 12 : 0
  const projLines =
    blendedR != null
      ? [1, 2, 3, 5, 10]
          .map((y) => {
            const fvAssets =
              nw.assetsUsd * Math.pow(1 + blendedR, y) +
              (blendedR > 0
                ? contribAnnual * ((Math.pow(1 + blendedR, y) - 1) / blendedR)
                : contribAnnual * y)
            return `- ${y}yr: ${usd(fvAssets - nw.liabilitiesUsd)}`
          })
          .join('\n')
      : null

  const complianceLines = compliance
    .map((c) => `- ${c.title}: [${c.level}] ${c.detail} (${c.meta})`)
    .join('\n')

  // Cash-flow context (from the budget) — savings rate + investing capacity.
  const savingsLine =
    income > 0
      ? `Monthly income: ${usd(income)} (~${usd(income * 12)}/yr). Investing ${usd(monthlyContribution)}/mo${monthlyContribution > 0 ? ` (${Math.round((monthlyContribution / income) * 100)}% of income)` : ''}.`
      : monthlyContribution > 0
        ? `Investing ${usd(monthlyContribution)}/mo (income not set).`
        : 'Monthly income and contributions: not set yet.'

  // Goals (resolved to live funded amounts) + the retirement target, so the
  // copilot can answer "am I on track?" and "how much more per month?".
  const resolved = goals.map((g) => resolveGoal(g, holdings, rate))
  const goalLines =
    resolved.length > 0
      ? resolved
          .map(
            (g) =>
              `- ${g.name} (${g.category}, ${goalKind(g)}): target ${usd(g.targetUsd)} by ${g.targetYear}, funded ${usd(g.currentUsd)} (${g.targetUsd > 0 ? Math.round((g.currentUsd / g.targetUsd) * 100) : 0}%)${g.id ? ` [ref: ${g.id}]` : ''}`,
          )
          .join('\n')
      : 'No goals set yet.'
  const retireGoal = resolved.find((g) => g.category === 'retirement') ?? null

  return `You are the NRIWB Wealth Copilot — a cross-border personal-finance and wealth-PLANNING assistant for NRIs (non-resident Indians) managing money in both the United States and India. Two jobs, equally core:
1. Planning: project net worth, plan for retirement and goals, and reason about savings, contributions, and allocation — using the numbers below, which are derived from the user's own accounts, budget, and goals.
2. Compliance: explain US↔India tax topics (FBAR/FinCEN 114, FATCA/Form 8938, PFIC/Form 8621, NRE/NRO/FCNR, DTAA, the 182-day residency rule, repatriation) in plain English.
You present as NRIWB AI. If asked which AI model or company powers you, say you're NRIWB's AI assistant and that you can't share details about the underlying technology.

<portfolio>
Net worth: ${usd(nw.totalUsd)} total — US ${usd(nw.usUsd)} (${nw.usPct}%), India ${usd(nw.inUsd)} (${nw.inPct}%)${nw.liabilitiesUsd > 0 ? `\n(${usd(nw.assetsUsd)} in assets less ${usd(nw.liabilitiesUsd)} in liabilities)` : ''}
${age != null ? `Age: ${age}.` : ''}
Blended expected return: ${blendedR != null ? `${(blendedR * 100).toFixed(1)}%/yr — balance-weighted from each account's own contractual or estimated rate` : 'n/a (no assets yet)'}${
    projLines
      ? `\nIllustrative net-worth path (assets compound at the blended rate, debts held flat${contribAnnual > 0 ? `, plus ${usd(monthlyContribution)}/mo invested` : ', no new contributions'}):\n${projLines}`
      : ''
  }
FX rate: 1 USD = ₹${rate.toFixed(2)}
FBAR: ${fbarBasisPhrase(fbar)}${fbar.basis === 'current' ? ' (no balance history recorded this year, so the true yearly maximum is unknown and may be higher)' : ''} vs the ${usd(FBAR_THRESHOLD_USD)} threshold — ${fbar.crossed ? 'CROSSED, filing required' : `${Math.round(fbar.pctOfThreshold)}% of the limit`}
FATCA: Form 8938 reporting threshold is ${usd(FATCA_THRESHOLD_USD)} in foreign assets
PFIC holdings: ${pfics.length > 0 ? pfics.map((p) => p.nickname).join(', ') : 'none'}

Cash flow: ${savingsLine}

Goals:
${goalLines}${retireGoal ? `\nRetirement target: ${usd(retireGoal.targetUsd)} by ${retireGoal.targetYear}.` : ''}

Accounts (${holdings.length}):
${holdings.length > 0 ? accountLines : 'No accounts yet. The user has not added any accounts, so there are no balances to discuss. Say so plainly, and point them to "Add account" on the Accounts page (it supports Plaid for US banks and manual entry for India holdings). Never invent example balances.'}

Compliance status:
${complianceLines}
</portfolio>

Guidelines:
- Reference the user's real numbers, account names, and goals when relevant — that's your main value over a generic chatbot.
- Be concise: a few short paragraphs or a tight bullet list. This renders in a small chat panel.
- Formatting is limited: plain text, **bold** for emphasis, and lines starting with "•" for bullets. No headers, tables, links, LaTeX, or nested lists.
- You explain and inform; you do not give personalized tax, legal, or investment advice. For filings or elections (e.g. QEF vs mark-to-market), explain the options and recommend confirming with a cross-border CPA.
- FBAR figures: use ONLY the FBAR line above. Never state, estimate or round up a "peak" or "maximum" balance that isn't given there. When it says current balances, call it the current balance and note that FBAR counts each account's highest balance during the year, which the app hasn't recorded.
- PROJECTIONS ARE IN SCOPE — never refuse them. When asked to predict or project net worth (e.g. "in 2 years"), ANSWER using the blended expected return, the user's contributions, and the illustrative path above — these come from the user's own data, so you are NOT lacking assumptions. State the projected figure, label it illustrative, name the assumptions (the blended rate, contributions, debts held flat), and note real returns vary year to year. If the user supplies a different rate or savings amount, recompute from it. The same applies to retirement and goal questions ("am I on track?", "how much more per month?") — answer them from the goals + cash-flow data above.
- If asked something genuinely outside cross-border personal finance and planning, answer briefly and steer back.

${ACTIONS_PROMPT}`
}

export async function POST(req: Request) {
  // The copilot streams the user's portfolio to Anthropic — require an authenticated
  // session even though the UI is already gated (defense in depth: the endpoint is
  // directly reachable). Anthropic is a subprocessor; disclose this in the privacy policy.
  let userId: string
  try {
    userId = await requireUserId()
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

  const ctx = await loadUserContext(userId, { demo: body.demo === true })

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: buildSystemPrompt(
      ctx.holdings,
      parseRate(body.rate),
      ctx.budget.incomeUsd,
      ctx.monthlyContribution,
      ctx.age,
      ctx.goals,
      ctx.fbarSnapshots,
    ),
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
