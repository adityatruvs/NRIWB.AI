# NRI Wealth Builder Dashboard — Complete 2026 Feature Specification

## P0 — MUST HAVE (LAUNCH)

1. Unified Net Worth View
Simple: One number, one screen. Everything you own minus everything you owe, across both countries, always current, in dollars or rupees.
Technical: Consolidated balance sheet with real-time dual-currency (USD/INR) normalization. Historical net worth chart with daily snapshots. Drill-down by jurisdiction, asset class, account type, currency denomination, and liquidity tier.

2. Jurisdiction Split View
Simple: Side-by-side: "US: $620K (52%) | India: $580K (48%)." Instantly see your geographic concentration.
Technical: Dual-pane view with per-jurisdiction totals (market value + cost basis). Percentage allocation with concentration threshold alerts (default: flag >70% single jurisdiction). Sub-jurisdiction drill-down — US by state, India by city/state. Repatriability filter within India assets: freely repatriable (NRE, FCNR) vs. restricted (NRO, property proceeds). Trend chart showing how the split has changed over time.

3. Multi-Currency Display
Simple: Every number shows both USD and INR. Toggle your preferred primary currency. Option for Indian formatting (lakhs/crores).
Technical: Dual-currency rendering throughout all views. FX rate displayed with timestamp. Indian number formatting toggle (₹58.3L instead of ₹5,830,000). Historical values shown at historical FX rates. Currency denomination badge on every asset.

4. FBAR & FATCA Threshold Monitor
Simple: "Your Indian accounts peaked at $47,000 today — FBAR filing required." Warns you early. Missing FBAR = $10K+ fines per account per year.
Technical: Continuous peak-balance tracking across all foreign financial accounts. FBAR: $10K aggregate peak balance (any single day). Alert at 80% threshold. FATCA Form 8938: separate thresholds by filing status ($50K–$600K range). Daily recalculation using peak-of-day values with day-rate FX conversion. Per-year filing status tracking: required → in-progress → filed (with confirmation number).

5. Compliance Status Panel
Simple: Traffic-light panel on your home screen. Green = compliant. Yellow = action needed soon. Red = overdue. Covers FBAR, FATCA, India ITR, FEMA limits, tax residency.
Technical: Real-time status engine monitoring: FBAR threshold + filing status, FATCA Form 8938 threshold + filing status, India ITR obligation + filing status, LRS utilization ($250K/person/year), PIS equity investment limits, tax residency day counts (US + India), TDS certificate collection status. Per-item status: Compliant / Action Needed / Overdue / Not Applicable. Click-through to detail with remediation steps.

6. Filing Deadline Calendar
Simple: Visual calendar with every tax/compliance deadline in both countries. Countdown timers. Color-coded by urgency. Only shows deadlines that apply to you.
Technical: Personalized deadline engine covering: US federal (April 15 return + FBAR, June/Sep/Jan estimated tax, Oct 15 extensions), US state (top 10 NRI states), India (July 31 ITR, Oct 31 audit cases, advance tax Jun/Sep/Dec/Mar), ad-hoc (Form 15CA/15CB on repatriation). Multi-stage notifications: 30/15/7/3/1 day. Advisor view with all clients' deadlines aggregated. Calendar export (ICS).

7. Account Connection Hub
Simple: A screen to connect all your accounts — US and India — just like linking a bank in Venmo. For accounts that can't connect automatically, a clean form to enter manually.
Technical: Multi-provider integration: US via Plaid/Yodlee (OAuth), India via Account Aggregator (consent-based), CDSL/NSDL (demat), CAMS/KFintech (MFs), direct bank APIs (NRE/NRO/FCNR). Structured manual entry forms per asset type with full data model parity. Connection health monitor: last refresh per account, stale connection alerts, re-auth prompts. Timezone-aware refresh scheduling for Indian institutions.

8. Security & Authentication
Simple: Bank-grade security. Encrypted data. Two-factor login required. Biometric on mobile. Your India CA only sees what you allow.
Technical: AES-256 at rest, TLS 1.3 in transit. MFA mandatory (TOTP, SMS fallback, hardware key for advisors). Biometric on mobile. Role-based access: Client, Spouse (configurable), US Advisor (scoped), India CA (scoped), Admin (no client data). SOC 2 Type II readiness. India DPDPA compliance (consent management, data principal rights). Immutable audit log of all data access.

P1 — MUST HAVE (WITHIN 60 DAYS)

9. Asset Class Breakdown
Simple: Pie chart showing your mix — Stocks 30%, Real Estate 35%, Cash/FDs 15%, Gold 10%, Retirement 8%, Other 2% — across both countries. Tap to drill in.
Technical: Unified cross-border asset taxonomy mapping US and India instruments to common categories (Equity, Fixed Income, Real Estate, Precious Metals, Cash, Retirement, Insurance, Alternatives). Interactive visualizations: pie/donut for allocation, stacked bar for trend. Configurable groupings: by asset class, jurisdiction, liquidity, tax treatment, repatriability. Drift alerts when any category exceeds tolerance band.

10. FX Impact Analysis
Simple: "Your India portfolio went up 2.1% in rupees this month, but the rupee weakened 1.3%, so in dollars you only gained 0.8%." Separates real performance from currency noise.
Technical: FX decomposition: local currency return vs. FX return vs. combined base-currency return. Period selection (MTD/QTD/YTD/1Y/3Y/5Y/inception). Chart overlay: portfolio performance (local) vs. portfolio performance (base) vs. USD/INR rate. Drill-down per asset, account, or asset class.

11. Real Estate Dashboard
Simple: All your properties on cards — your NJ house, your Bangalore flat, the Hyderabad plot. Each shows: value, mortgage, equity, rental income, key docs.
Technical: Per-property cards: valuation (US: Zillow API; India: manual with circle rate benchmark), purchase price/date/cost basis (India: CII indexation), mortgage details, rental income tracking with TDS monitoring (30% for NRIs), FEMA compliance (agricultural land restricted), capital gains modeler ("if I sell, what's my tax in both countries?"), per-property document storage.

12. Gold & Precious Metals Dashboard
Simple: "You have 850 grams gold worth $72,400. Breakdown: 12% US ETFs, 25% SGBs, 63% physical/jewelry." Live prices. SGB maturity/interest calendar.
Technical: Unified precious metals view: US ETFs (auto from brokerage), India gold ETFs (auto from demat), SGBs (from demat + maturity/interest schedule), physical gold (manual: weight, purity, storage), jewelry (declared/appraised value with revaluation prompts). Purity-adjusted weight (24K equivalent). Live spot pricing. SGB calendar with maturity dates and interest payment dates. Total gold as % of net worth.

13. Retirement Accounts Consolidation
Simple: All retirement money: 401(k) $320K, Roth IRA $85K, EPF ₹18L, PPF ₹12L. Each with a note: "Can't contribute to PPF as NRI." "EPF withdrawal taxable if before 5 years."
Technical: Cross-border retirement aggregation with per-account rule overlays: contribution eligibility, withdrawal rules, early withdrawal penalties, RMD schedule (US after age 73), tax treatment of withdrawals in both jurisdictions, DTAA Article 20/22 analysis. Retirement readiness score factoring both countries. Social Security Totalization Agreement awareness.

14. Proactive Alerts & Notifications
Simple: The app taps your shoulder: "FBAR threshold crossed." "India advance tax due in 14 days." "USD/INR hit your target rate." "You've been in India 120 days this year."
Technical: Event-driven engine with categories: Compliance (FBAR/FATCA/residency/FEMA — can't miss), Financial (FX targets, portfolio drift, FD maturity), Operational (stale connections, manual entry refresh needed), Informational (regulatory changes, SGB interest payment). Multi-channel: in-app, push, email, SMS. Configurable frequency. Advisor CC on compliance alerts.

15. Document Vault
Simple: Secure digital locker for all important papers — tax returns, property deeds, FBAR confirmations, PAN card, OCI card. Organized by type and country. Shareable with advisors.
Technical: Encrypted storage (AES-256). Categorization: tax filings, property docs, insurance, identity (PAN/OCI/passport), compliance filings, advisor correspondence. Jurisdiction tagging. Auto-filing prompts ("You added a property — upload title deed?"). Version tracking (2024 FBAR, 2025 FBAR). Selective advisor sharing by category. Retention rules: IRS 7 years, India IT 6 years. Cross-reference to assets (deed linked to property record). Mobile camera capture.

16. Tax Residency Day Counter
Simple: "You've spent 134 days in India this year. 48 days left before you risk India tax residency. At this pace, you'll hit the limit by August 22."
Technical: Dual-jurisdiction tracker: US Substantial Presence Test (183-day weighted 3-year formula), India Section 6 (182 days + 60-day/120-day rules with NRI-specific exceptions). Manual trip logging (departure/return/country). Forward projection based on planned travel. Impact modeling: "If you become India tax resident, here's what changes — global income taxable in India, NRE interest taxable, DTAA benefits shift."

17. NRE/NRO/FCNR Optimizer
Simple: "You have ₹38L in NRO (taxable at 30%). If you shift ₹20L to NRE (tax-free in India), you save ₹52,000/year. Here's how."
Technical: Deposit optimization engine: rate comparison across major banks, tax-adjusted yield calculation (NRE exempt under Section 10(4)(ii), NRO taxable with 30% TDS, FCNR exempt but lower rates). Net after-tax yield side-by-side for each account type considering India tax + US tax (with FTC). Deposit maturity calendar with reinvestment recommendations. FBAR impact of deposit movements.

## P2 — GOOD TO HAVE (YEAR 1)

18. Scenario Modeler / What-If Engine
Simple: "What if I sell the Mumbai flat?" → See taxes in both countries, net proceeds, FX impact. "What if I retire in India?" → See cost comparison, healthcare, drawdown sequence.
Technical: Interactive simulation for: asset sale (capital gains both jurisdictions), repatriation (pathway + TDS + FX + LRS check), retirement location (US/India/split with dual inflation), relocation (tax residency transition + account reclassification), major purchase. Output: side-by-side scenario comparison with net USD outcome, taxes, compliance steps, and timeline.

19. Advisor Collaboration Workspace
Simple: Your US CPA, India CA, and financial advisor each get their own login. They see only what you authorize. They can message each other, assign tasks, and co-manage your filings.
Technical: Role-based multi-advisor access scoped by module. Secure messaging with threaded conversations. Task assignment and tracking ("Need TDS certificate by March 1" → task auto-assigned to India CA). Pre-meeting AI briefing per advisor role. Cross-advisor handoffs with context. White-label support for advisor firms. Filing coordination workflow with deadline tracking.

20. Repatriation Tracker & Planner
Simple: "I want to bring ₹50L to the US." → "Send from NRO. TDS: ₹3.1L. Need Form 15CA + 15CB. At today's rate: $55,800. LRS remaining: $187K." Plus a multi-year planner for phased transfers.
Technical: LRS dashboard ($250K/person/year with family aggregation). Per-asset-type repatriation pathway engine (NRE = free, NRO = Form 15CA/15CB + $1M/year cap, property sale = specific FEMA rules). Tax impact calculator (TDS + FTC). FX timing tool (current rate, trend, target rate alerts). Document generator (pre-populate 15CA/15CB). Transfer audit log. Multi-year phased repatriation modeler for tax bracket optimization.

21. Cash Flow Tracker
Simple: Income vs. expenses split by country. "You earn $180K in the US and ₹4.8L/month in India rent. You spend $12K/month in the US and ₹35K/month on India property maintenance."
Technical: Transaction categorization with NRI-specific categories (remittance, TDS, LRS transfer, rental income). Cross-border transfer isolation (not double-counted). Currency-normalized view. Per-jurisdiction surplus/deficit. Recurring transaction detection (LIC premium, society maintenance, loan EMI).

22. Family / Household View
Simple: Your net worth + spouse's + parents' estate (what you may inherit) + kids' 529 plans. The whole family picture with clear ownership lines.
Technical: Household entity modeling: primary, spouse, dependents, parents (estate planning visibility). Per-asset ownership: sole, joint, beneficial interest, POA. Household net worth with individual drill-down. Family-level compliance: FBAR is per-individual, LRS capacity is per-person (family total = $250K × members). Inheritance pipeline (read-only estimates of parents' India assets). Children's education tracking.

23. Investment Performance Analytics
Simple: "Your US portfolio returned 14.2%. India portfolio: 11.8% in rupees, 6.1% in dollars. Total combined: 10.4% in dollars."
Technical: Time-weighted returns per account, asset class, jurisdiction, and total. Local vs. base currency decomposition. Benchmark comparison (S&P 500, Nifty 50, CRISIL Composite Bond). Risk metrics (standard deviation, Sharpe, max drawdown) per jurisdiction and combined. Tax-adjusted returns. Fee impact analysis. Period selection (MTD through inception).

24. Insurance Coverage Dashboard
Simple: All insurance in one view: US health + life, India LIC + health for parents. Gap analysis: "If something happens, your India dependents are underprotected by ₹35L."
Technical: Coverage aggregation (US + India, all policy types). Needs-based gap analysis factoring liabilities and dependents in both countries, currency-adjusted. Cross-border gaps: "US health doesn't cover India hospitals beyond emergency." Premium tracking with renewal calendar. Tax treatment flags (India LIC maturity may be taxable in US even if India-exempt).

25. FEMA Compliance Monitor
Simple: India has rules about what NRIs can invest in, what property they can buy, how much they can send out. This tracks all of it and warns you before you break a rule.
Technical: FEMA rule engine: LRS ($250K/year outbound), PIS (NRI equity holding limits per company and aggregate), property rules (residential/commercial OK, agricultural land prohibited), sectoral caps for specific industries, FLA return obligation if applicable. Alert on approaching limits. Versioned rule set with RBI circular references and effective dates.

26. Tax-Loss Harvesting Scanner
Simple: "You have a $4,200 loss in an India mutual fund. Sell and rebuy similar fund = ~$1,000 US tax savings. But watch the 30-day wash sale rule in the US."
Technical: Cross-border loss identification across all equity/MF positions. US wash sale rule (30 days, substantially identical) + India rules (STCL offsets STCG only, LTCL offsets LTCG only). Cross-border nuance: India-position losses usable against US gains if properly reported. PFIC complication flagging for India MFs. Ranked opportunity list with estimated tax savings and recommended action.