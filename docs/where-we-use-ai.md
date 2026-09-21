# Where NRIWB Uses AI

**The one rule:** AI is never generic. Every call is grounded server-side in the
user's *own* numbers — their accounts, budget, goals, FX rate, and compliance
status — recomputed from live data so the model always sees the same figures the
dashboard renders. The AI **explains and proposes; it never advises and never
mutates data on its own.** (Educate, don't advise. The user is the actor.)

Everything below is one of five jobs AI does over that shared financial state.

---

## The five jobs (high level)

| # | Job | What it means | Where it shows up |
|---|-----|---------------|-------------------|
| 1 | **Explain** | Turn raw numbers into plain-English understanding | Analyzer recommendations; Copilot answers |
| 2 | **Detect** | Surface *only* what genuinely needs attention — the "finding" | Home attention queue (Insights) |
| 3 | **Project / Plan** | Answer "what will I have?" / "am I on track?" | Retirement planner; Copilot projections |
| 4 | **Translate intent → structured data** | Natural language → a real account, goal, or budget line | Goal suggester; Copilot proposals |
| 5 | **Converse + act** | A grounded chat that can *propose* edits you accept/edit/discard | Copilot |

The differentiator is always **the border** — returns split into real vs.
currency, debt in one currency serviced by income in another, US↔India tax. A
US-only or India-only tool cannot do any of this. That cross-border framing is
what every AI touchpoint reflects.

---

## Live today — the five endpoints

### 1. Net worth & the attention queue → `/api/insights`
**Job: Detect.** On Home, AI reads your full cross-border portfolio (net worth,
US/India split, FBAR peak vs. threshold, FATCA, PFIC holdings, allocation) and
returns *only* the items that truly need action — real tax/compliance
obligations and material portfolio issues. Quality over quantity: a healthy
portfolio returns **fewer** items, or none.
- **Example:** *"FBAR — FinCEN 114: your India accounts peaked at $87k, over the
  $10k threshold. → Due Apr 15 (auto-ext. Oct 15)."*
- **Example:** *"India allocation drift: 64% of investable wealth sits in one
  market. → Rebalance suggested."*
- **Safety net:** if AI is unavailable, a rule-based `complianceItems()` fallback
  fills the same queue — the finding never silently disappears.

### 2. Portfolio Analyzer recommendations → `/api/analyzer`
**Job: Explain.** AI reviews your live target vs. current allocation, age, risk
appetite, and income, then streams a plain-language read on your *next move* —
what to shift and why, cross-border aware.
- **Example:** *"You're 12 pts more aggressive than recommended for 34. Your gold
  sleeve (18%) is doing FX duty, not growth — trimming it toward 8% and adding US
  equities would cut single-market concentration."*
- Cached per user so returning users see the last recommendation instantly; they
  refresh after changing the split.

### 3. Retirement planner → `/api/retirement/plan`
**Job: Project / Plan.** You describe retirement in one sentence; AI converts it
into a concrete plan — retirement age, target pot, expected return, contribution
step-up — grounded in your actual savings, monthly contribution, and the
balance-weighted return of your real accounts. It then back-solves the monthly
investing needed and writes it to your budget.
- **Input:** *"retire at 65 with $10M at 10%/yr and 5% yearly contribution
  raises."*
- **Output:** fills the age slider, retirement target (shared with your Goals
  page), return %, and step-up — plus a rationale converting an income wish via
  the 4% rule and flagging feasibility.

### 4. Goal suggester → `/api/goals/suggest`
**Job: Translate intent → structured data.** Plain-language goal → one
structured goal (name, category, target USD, target year, cost vs. investment),
with cross-border cost estimates anchored to country of residence.
- **Input:** *"fund my 8-year-old's US college."*
- **Output:** *"Aarav's US college — education, $220,000, targetYear 2036 (age 18),
  kind: cost."* Rationale: *"4-yr US undergrad ≈ $150k–280k; dated to when the
  child turns 18."*

### 5. The Copilot → `/api/copilot`
**Job: Converse + act.** The always-available assistant, grounded in the *same*
server-computed snapshot (net worth, blended return, illustrative net-worth path,
FBAR/FATCA/PFIC, cash flow, every goal, every account with a `ref:` handle). Two
core jobs: **planning** (project net worth, retirement, goals, allocation) and
**compliance** (FBAR, FATCA, PFIC, NRE/NRO/FCNR, DTAA, the 182-day rule,
repatriation) — in plain English.
- **Projections are in scope** — it never refuses "what will my net worth be in 2
  years?"; it answers from your blended rate + contributions and labels it
  illustrative.
- **It can act via proposals.** When you ask to add/change an account, goal,
  income, or budget line, it appends a `[[PROPOSALS]]` block that renders as an
  **accept / edit / discard** card. The Copilot *never* mutates anything itself —
  you apply it. (See [[copilot-actions]].)
- **Example:** *"Add my HDFC NRE fixed deposit, ₹15L at 7.1%"* → a proposal card
  pre-filled with the FD, scheme NRE, rate, maturity — you confirm.

---

## Cross-cutting guarantees

- **Grounded, not generic** — the value over ChatGPT is that it cites *your* real
  account names, balances, and goals.
- **Auth + disclosure** — every AI route requires an authenticated session
  (defense in depth) and Anthropic is disclosed as a subprocessor in the privacy
  policy.
- **Educate, don't advise** — explains options and recommends confirming with a
  cross-border CPA for filings/elections; never gives personalized tax, legal, or
  investment advice.
- **Illustrative, labeled** — every projection names its assumptions (blended
  rate, contributions, debts held flat) and is marked not-a-guarantee.

---

## Roadmap — where AI extends next (per the stakeholder ask)

The current five cover Explain / Detect / Plan / Translate / Converse. The
amended vision extends the same grounded pattern into the surfaces still being
built:

- **Status engine ("the spine")** — NRI → RNOR → ROR timeline; AI explains *what
  applies when* and detects obligations the date triggers (exit-cost modeling,
  treaty relief, unified filing calendar).
- **Scenario / Plan engine** — a movable return-date slider driving RNOR windows,
  sell-inside-window flags, Roth-conversion windows; AI narrates the trade-offs
  ("the biggest cross-border decisions are timing decisions, and nobody models
  them").
- **Performance** — AI attribution of every movement into *real vs. currency*,
  benchmarked against both markets; standardized concentration warnings.
- **Cash flow** — LRS-limit guidance and transfer-option mechanics (lump sum now
  vs. monthly), driven off the plan.
- **Debt analysis** — prepay-vs-invest with FX sensitivity, cross-currency
  mismatch (₹ debt serviced by $ income), deductibility per country.
- **Legacy** — a "prepare legacy" narrative + handover pack (validate importance
  before deep-building).
- **Open items** — every AI finding lands here naming its source page, with a
  cost-of-inaction, and clears itself when the work is done (the retention loop).
