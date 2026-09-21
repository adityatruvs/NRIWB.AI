# NRIWB — The Stakeholder Ask, Consolidated & Interpreted

**Sources:** `NRIWB-platform-walkthrough.pdf` (the target product, 9 surfaces), `NRIWB-platform-capabilities.pdf` (8 domains + copilot layer + trust base, data reality, build sequence), `Platform_walkthrough_review_-_AGL.pdf` (stakeholder review that *amends* the walkthrough), `ProductPresentationComparison.pdf` (internal gap audit, used as corroboration).

**Reading rule used everywhere below:** the walkthrough is the baseline; the AGL review overrides it wherever they conflict. The traceability sheet (`requirements-traceability.csv`) traces against this *amended* vision.

---

## 1. What they are actually asking for (the essence)

Strip away the nine pages and the ask is **one engine with two always-on outputs and one loop**:

1. **Two always-on capabilities** (capabilities deck, p11): **cross-border net worth** (Position) and **residency status** (the NRI→RNOR→ROR engine). "Only two capabilities run a user's entire life... Those two are the platform — build them right first." Everything else is a *window that opens and closes*.
2. **One loop** (walkthrough p24): *Home surfaces it → the page explains it → Open items tracks it → Accounts reflects it → confidence rises.* "Nothing the platform finds is allowed to quietly disappear." Activation and retention are the **finding**, not the balance.
3. **The differentiator is the border, not the dashboard.** Every "table stakes" feature must be *rendered cross-border*: returns split into real vs currency, debt in one currency serviced by income in another, goals whose target currency differs from their funding currency, and a tax engine no US-only or India-only tool can serve.

**Who it's for:** users with assets on *both* sides — complexity is the segment, not age or net worth.

---

## 2. The amended vision, surface by surface

### Home
Walkthrough: one screen — wealth split three ways, ranked attention queue, one-line read on all eight pages, open-items strip, ask bar.
**AGL amendments:**
- **Guided first-run** — alerts only make sense to experienced users; new users need a path.
- **Kill the "Ask about your money…" bar** → floating copilot icon lower-right (standard chatbot pattern) with suggested-query popup, on every page.
- **No mixed currencies** — one global toggle (USD ⇄ ₹/Cr) applied consistently; NRIs move wealth back and forth and want to see it one way.
- **"3 of 4 on track" is useless** → per-goal widgets (name, progress, status).
- **Generic "Your money now / Obligations & future" groups are weak** → concrete widgets: goal cards, assets & liabilities summary, etc.
- **Navigation must be obvious.**

### Accounts (absorbs Debt)
Walkthrough: the *only page that holds records* — every other page is a view over it. Assets − Debt = Net worth. **Per-row freshness** (Today / 3 months / 14 months) with "refresh the oldest + largest first" guidance.
**AGL amendments:**
- If summary shows "less debt", **debt accounts must appear in the ledger** — *debt is not a separate page; every debt is an account* (kills the standalone Debt surface).
- **Quicken-style type tree**: Banking (Cash/Credit/Savings), Investments (Brokerage/Retirement/Education/Other), Assets (Real estate), Liabilities (Home loan) — *in addition to* jurisdiction. Filtering/sorting must scale to ~30 accounts.
- Category summaries of assets/liabilities incl. unlinked (real estate, estimates) — more than just stale-account reminders.

### Performance
Walkthrough: the one chart no single-country tool can draw — reported = currency effect + real; by-side (US local / India local / India after FX); blended allocation; concentration flag.
**AGL amendments:**
- **Three return lenses for any account or category**: local ("real"), USD-adjusted, INR-adjusted — user picks the lens.
- **Concentration warnings standardized** — alerts/suggestions live in ONE canonical site, separate from factual summaries.
- Capabilities adds: benchmarking against both markets; FX attribution on every movement.

### Debt → folded into Accounts + an Analysis surface
The *analysis* survives even though the page dies: prepay-vs-invest with FX sensitivity, cross-currency mismatch (80% of debt in ₹, 100% of income in $), deductibility per country, blended rate / monthly service — **consolidated on an analysis page**, not on a debt tab.

### Cash flow
Walkthrough: In/Out/Net both sides; family support; border panel (rate vs your 12-mo average, repatriable this FY, LRS used).
**AGL amendments:**
- **"Going out" numbers must come from a plan/goal** (annual cash needed in US and India) — not free-typed; guidance follows from the plan.
- **Daily-rate-vs-your-average is NOT important** (deprioritized). What matters: **LRS limits + transfer-option guidance** (lump sum now vs monthly, issues, mechanics).

### Tax → status engine + a plan, then two filing boards
Walkthrough: status timeline (NRI now → RNOR Apr 2027 → ROR Apr 2029) sits above everything "because it decides what applies"; US filings (FBAR, 8938, 8621×N, 3520) and India filings (ITR, NRO TDS+DTAA, 15CA/CB, Schedule FA) side by side; red items link to guided fixes.
**AGL amendment:** the status is really **a plan** — a return date implies tax moves, asset relocation, future cash needs. Reminders + plain-language explanations stay.
Capabilities adds: obligation detection, PFIC exposure & **exit-cost modeling**, treaty relief, unified calendar + professional handoff. **"The status engine is the spine."**

### Goals (absorbs Plan-as-entry and Legacy-as-entry)
Walkthrough: each goal in its **own target currency**; funding source; **currency-mismatch flag**; status chips (On track / Ahead / Currency risk); retirement target depends on location (US $3.1M / India $1.4M / split $2.2M).
**AGL amendments:**
- **Guided flow**: type → suggested amounts → assign cash flows & investments → home widget.
- **"Isn't a plan just a type of goal?"** Move-to-India, retire → goal types that feed the scenario engine.
- **Legacy is a "prepare legacy" goal type** with guidance — and *validate its importance before deep-building* ("almost an app in itself").

### Plan (the scenario engine — still required even if entered via Goals)
Movable return-date slider → RNOR window, sell-inside-window flags, global-income-taxable-from date; a **windows timeline** (clean-up now–2029, RNOR 2029–31, Roth conversions 2035–43); **save scenario → actions become open items**. Capabilities adds: drawdown across two tax systems, relocation modeling, general what-if engine. "The biggest cross-border decisions are timing decisions, and nobody models them."

### Legacy (validate first, then build)
Who-owns-what (title, what-happens-if-died-today), coverage (wills/POA/nominees per country), heir-burden narrative, **handover pack** document. Output is a document, not a dashboard.

### Open items (endorsed unchanged — the retention loop)
Every finding lands here **naming its source page**; in-progress (step N of M + concrete next action + blocking relations); not-started (with **cost of inaction**); closed recently. Closing an item updates Accounts and clears Home. AGL: "Good page."

### Copilot (a layer, not a tab)
Grounded on your data only, never generic; proactive detection; plain language; **present on every page** — AGL concretizes this as the floating lower-right icon with suggested queries.

### Trust & data (the base layer)
Provenance, permissions, **household access**; data confidence.

---

## 3. What AGL explicitly killed or deprioritized

| Original walkthrough element | AGL verdict |
|---|---|
| Standalone Debt page | Fold into Accounts; move analysis to an analysis page |
| "Ask about your money…" bar | Replace with floating copilot icon + suggested queries |
| Daily rate vs your 12-mo average ("better than 78% of transfers") | Not important — LRS limits & transfer guidance instead |
| "3 of 4 on track" goals summary | Replace with per-goal widgets |
| "Your money now / Obligations & future" generic groups | Replace with specific widgets |
| Tax as a static page | Reframe as a plan driven by the return date |
| Standalone Plan & Legacy as coequal pages | Entry via goal types (engines still needed underneath) |
| Legacy full build | Validate importance first |
| Mixed currencies in the wealth summary | One consistent toggle |

---

## 4. Build sequence & data reality (constraints the sheet respects)

- **Phase 1 — the spine:** Position + compliance *detection*. Works on manual India data **today**. (No excuse to wait on India rails.)
- **Phase 2 — the state:** Performance, liabilities, cash flow. **Gated on India data procurement** (CAS ingestion CAMS/KFintech is the single biggest unlock; doc extraction next; Account Aggregator aspirational).
- **Phase 3 — the moat:** Planning, estate, execution — requires the spine to already be trusted.
- Data today: US Position/Cash flow live via Plaid, Performance live* (tax lots institution-dependent), Liabilities **partial** (rate/term only for cards/student/mortgage), India everything manual/CAS. 6 of 8 domains depend on India data collected by hand → **India procurement is a separate workstream, not a backlog item.**

---

## 5. Acceptance yardsticks (the four journeys)

1. **First session:** connect → India setup → *first finding* → Open items. Activation = the finding.
2. **Weekly:** Home → Cash flow in 90 seconds.
3. **Tax season:** alert → Tax → detail → Open items → **alert clears itself** when the work is done.
4. **Life event:** Goals → Plan → windows → Open items → Legacy.

A surface isn't "done" until its findings travel this loop.
