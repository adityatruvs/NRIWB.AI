/**
 * Mock derived-insight data for the demo experience.
 * In production these come from the balance-history table, the residency
 * day-counter, and the deadline engine. Numbers are hand-tuned to tell a
 * coherent story alongside MOCK_ACCOUNTS.
 */

/* ── Net-worth history (12 months, in USD) ────────────────────────────────── */
// Trends gently upward with realistic month-to-month wobble.
// The final value tracks the live mock total (~$780K at ₹95); the dashboard
// rescales this series to whatever value is currently on screen.
export const NET_WORTH_HISTORY: { month: string; usd: number }[] = [
  { month: 'Jul', usd: 661_000 },
  { month: 'Aug', usd: 672_400 },
  { month: 'Sep', usd: 668_900 },
  { month: 'Oct', usd: 689_200 },
  { month: 'Nov', usd: 701_800 },
  { month: 'Dec', usd: 712_300 },
  { month: 'Jan', usd: 724_900 },
  { month: 'Feb', usd: 731_600 },
  { month: 'Mar', usd: 742_300 },
  { month: 'Apr', usd: 756_800 },
  { month: 'May', usd: 768_400 },
  { month: 'Jun', usd: 779_900 },
]

/* ── Tax residency day counter ────────────────────────────────────────────── */
export const RESIDENCY = {
  daysInIndia: 134,
  limit: 182, // crossing this risks Indian tax residency
  year: 2026,
  projectedCrossDate: 'Aug 22',
}

/* ── Filing & compliance deadlines ────────────────────────────────────────── */
export interface Deadline {
  label: string
  country: 'US' | 'IN' | 'Both'
  daysLeft: number | null // null = already filed
  status: 'upcoming' | 'soon' | 'filed'
  note: string
}

export const DEADLINES: Deadline[] = [
  { label: 'FBAR — FinCEN 114', country: 'US', daysLeft: 128, status: 'upcoming', note: 'Auto-extended to Oct 15' },
  { label: 'US Estimated Tax — Q3', country: 'US', daysLeft: 23, status: 'soon', note: 'Form 1040-ES' },
  { label: 'India ITR', country: 'IN', daysLeft: null, status: 'filed', note: 'Filed Mar 28' },
  { label: 'Form 15CA', country: 'IN', daysLeft: 41, status: 'upcoming', note: 'Required before next repatriation' },
]

/* ── Goals across both countries ──────────────────────────────────────────── */
export interface Goal {
  name: string
  icon: 'retirement' | 'education' | 'property'
  targetUsd: number
  currentUsd: number
  targetYear: number
  accent: string // css color var
}

export const GOALS: Goal[] = [
  {
    name: 'Retirement',
    icon: 'retirement',
    targetUsd: 2_000_000,
    currentUsd: 1_020_000,
    targetYear: 2041,
    accent: 'var(--brand)',
  },
  {
    name: "Child's Education",
    icon: 'education',
    targetUsd: 250_000,
    currentUsd: 96_000,
    targetYear: 2035,
    accent: 'var(--us)',
  },
  {
    name: 'India Property',
    icon: 'property',
    targetUsd: 180_000,
    currentUsd: 132_000,
    targetYear: 2029,
    accent: 'var(--saffron)',
  },
]

/* ── Target allocation (for portfolio-drift signalling) ───────────────────── */
export const TARGET_INDIA_PCT = 25

/* ── AI Copilot — suggested prompts + canned, account-aware answers ───────── */
export interface CopilotAnswer {
  /** Matched against the user's message, lowercased. */
  keywords: string[]
  /** Markdown-ish answer; `**bold**` is rendered. */
  answer: string
  /** Optional follow-up chips. */
  followups?: string[]
}

export const COPILOT_SUGGESTIONS = [
  'Do I need to file FBAR this year?',
  'What is a PFIC and does it affect me?',
  'How can I reduce tax on my NRO account?',
  'Am I at risk of becoming an India tax resident?',
]

export const COPILOT_ANSWERS: CopilotAnswer[] = [
  {
    keywords: ['fbar', 'fincen', '114', 'foreign bank'],
    answer:
      "**Yes — you'll need to file FBAR.** Your India accounts (HDFC NRE FD, SBI NRO, HDFC Mutual Fund, SBI FD) peaked at a combined **~$80,000** this year, far above the **$10,000** aggregate threshold.\n\nFBAR (FinCEN Form 114) is filed electronically through the BSA E-Filing System and is **separate from your tax return**. The deadline is April 15, automatically extended to **October 15**.\n\nMissing it can carry penalties of **$10,000+ per account**, so this is worth handling early.",
    followups: ['How do I actually file FBAR?', 'Is FBAR different from FATCA?'],
  },
  {
    keywords: ['pfic', '8621', 'mutual fund', 'mf'],
    answer:
      "**Yes — this affects you.** Your **HDFC Mutual Fund** (₹18L / ~$19K) is classified as a **PFIC** (Passive Foreign Investment Company) under US tax law. Almost all India mutual funds are.\n\nPFICs require **Form 8621** with your US return, and are taxed punitively under the default method — gains can be taxed at the highest marginal rate plus an interest charge.\n\nMany NRIs only discover this when their CPA adds a surprise fee. A common strategy is making a **QEF or mark-to-market election**, but that's worth discussing with a cross-border tax professional.",
    followups: ['Should I sell my India mutual funds?', 'What is a mark-to-market election?'],
  },
  {
    keywords: ['nro', 'tds', 'reduce tax', 'nre', 'repatriat'],
    answer:
      "Your **SBI NRO Savings** holds ₹8L, and NRO interest is taxed at **~30% TDS** in India. A few levers:\n\n• **Shift eligible funds to NRE** — NRE interest is **tax-free in India** and fully repatriable. Moving ₹8L could save roughly **₹24,000/year** in TDS.\n• **File Form 15CA/CB** before repatriating to stay FEMA-compliant.\n• **Claim the India–US DTAA** to avoid double taxation on NRO income.\n\nThis is informational — your funds' origin determines NRE eligibility, so confirm with your bank.",
    followups: ['How do I move NRO funds to NRE?', "What's the LRS limit?"],
  },
  {
    keywords: ['residen', '182', 'days', 'india tax'],
    answer:
      "**You're getting close, but you have room.** You've spent **134 days** in India this year. Crossing **182 days** makes India tax your **worldwide income** — a costly trigger for NRIs.\n\nAt your current pace you'd reach the limit around **Aug 22**, leaving **~48 days** of buffer. If you're planning an extended India trip, track it carefully — even the **60-day rule combined with 365 days over 4 years** can apply in some cases.\n\nI'll alert you as you approach the threshold.",
    followups: ['What counts as a day in India?', 'What happens if I cross 182 days?'],
  },
  {
    keywords: ['net worth', 'how much', 'total', 'portfolio'],
    answer:
      "Your **total net worth is about $842K**, split roughly **82% US / 18% India**. The largest pieces are your **Vanguard 401(k)** ($280K) and **Fidelity Brokerage** ($150K) on the US side, and your **HDFC NRE FD** (₹45L) in India.\n\nYour India allocation is slightly below your **25% target**, mostly because US equities have run up. Nothing urgent — but worth noting if you want to rebalance toward India.",
    followups: ['Should I rebalance toward India?', 'Break down my US accounts'],
  },
]

export const COPILOT_FALLBACK =
  "That's a great question. I work best with questions about your **cross-border finances** — FBAR and FATCA filing, PFIC classification on India mutual funds, NRE/NRO/FCNR tax treatment, India tax residency, or repatriation under LRS.\n\nTry one of the suggestions, or ask me about any of your linked accounts."
