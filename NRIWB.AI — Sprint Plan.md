NRIWB.AI — Sprint Plan
Three-Phase Approach: Local First → Sandbox APIs → Cloud

Phase Overview
| Phase | Sprints | Dates | What Changes | Cost |
| --- | --- | --- | --- | --- |
| Phase 1: Pure Local | S0–S2 | Jun 2–20 | Next.js + SQLite + mock data. No external services except Claude AI and FX rate | ~$2–5/month |
| Phase 2: Sandbox APIs | S3–S4 | Jun 23–Jul 4 | Replace mock data with real Plaid sandbox + Setu sandbox. Still localhost | $0 (both sandboxes free) |
| Phase 3: Cloud | S5 | Jul 7–11 | Migrate SQLite → Supabase. Add Clerk auth. Deploy to Vercel | ~$107–197/month (only starts here) |

Tech Stack by Phase
| Layer | Phase 1 | Phase 2 | Phase 3 |
| --- | --- | --- | --- |
| Framework | Next.js local | Same | Same → Vercel |
| Database | SQLite via Prisma (dev.db file, zero config) | Same | Swap connection string → Supabase Postgres |
| Auth | None — hardcoded MOCK_USER_ID | None | Add Clerk |
| US Accounts | Mock JSON (Plaid-shaped) | Real Plaid sandbox | Real Plaid production |
| India Accounts | Mock JSON (Setu-shaped) | Real Setu sandbox + PDF/Textract | Real Setu production |
| AI Copilot | Real Claude API (just a key) | Same | Same |
| FX Rate | Real ExchangeRate-API (free) | Same | Same |
| File Storage | Local uploads/ folder | Same | Supabase Storage |
The key insight: switching from Phase 1 → 3 is mostly changing DATABASE_URL in .env, adding Clerk, and running vercel deploy. The actual app code changes almost nothing.

Mock Data Strategy (Phase 1)
Create src/data/mock/ with realistic data mirroring exactly what Plaid and Setu return. When you move to Phase 2, you swap getMockAccounts() → getPlaidAccounts(). Nothing else changes.
src/data/mock/
plaid-accounts.ts     ← Chase checking $12.5K, Fidelity brokerage $150K, Vanguard 401k $280K
setu-accounts.ts      ← HDFC NRE ₹45L, SBI NRO ₹8L, HDFC FD ₹12L, HDFC MF ₹18L
fx-rates.ts           ← Sample USD/INR with timestamps
user-profile.ts       ← Rahul Mehta, Bay Area, $1M+ NW (your "Rahul" persona)

Sprint 0 — Foundation (Jun 3–6)
Goal: Running Next.js app on your laptop with SQLite, mock data seeded, no logins, no services.
| # | Task | What Gets Built | Acceptance Criteria | Days | Risk |
| --- | --- | --- | --- | --- | --- |
| S0-1 | Next.js project setup | create-next-app with TypeScript + Tailwind. Folder structure: src/app/, src/components/, src/lib/, src/types/, src/data/mock/. shadcn/ui init. Prettier + ESLint | npm run dev → localhost:3000 loads. No TypeScript errors | 0.5 | Low |
| S0-2 | Prisma + SQLite setup | npm install prisma @prisma/client. npx prisma init --datasource-provider sqlite. Creates prisma/schema.prisma and dev.db. Zero Docker, zero config | npx prisma studio opens visual DB editor at localhost:5555 | 0.25 | Low |
| S0-3 | Database schema | Prisma models: Account (all fields including accountType, country, balanceUsd, balanceInr, isManual, source, plaidAccountId, setuConsentId), FxRate, Conversation, ComplianceData. npx prisma migrate dev --name init | dev.db created. All tables visible in Prisma Studio. Test row inserts successfully | 1 | HIGH |
| S0-4 | Mock data files | plaid-accounts.ts: 3 US accounts in Plaid API response shape. setu-accounts.ts: 4 India accounts in Setu AA response shape. user.ts: MOCK_USER = { id: 'dev-user-1', name: 'Rahul Mehta' } | Mock files export typed data. Can import and use in any component | 0.5 | Low |
| S0-5 | Mock data seeder | src/lib/seed.ts: reads mock files, writes to SQLite via Prisma. npx ts-node src/lib/seed.ts seeds the whole DB in one command | Prisma Studio shows 7 accounts with correct types + balances after seeding | 0.5 | Low |
| S0-6 | Env variables | .env (committed, safe): DATABASE_URL, MOCK_USER_ID, NEXT_PUBLIC_APP_ENV=local. .env.local (gitignored): ANTHROPIC_API_KEY, EXCHANGE_RATE_API_KEY | App boots. No secrets in git history | 0.25 | Low |
| S0-7 | App shell + nav | Top nav (logo, currency toggle placeholder, hardcoded MOCK_USER.name), left sidebar (Dashboard, Accounts, Copilot), main content area. No login screen | App loads at localhost:3000. Nav renders. No crashes | 0.5 | Low |
Total: ~3.5 days. End state: npm run dev → app running. Prisma Studio at localhost:5555. 7 mock accounts in SQLite. Nothing else needed.

Sprint 1 — Currency Engine + Full UI (Jun 9–13)
Goal: Entire product UI working with mock data. Dashboard, all account cards, all forms, currency toggle.
| # | Task | What Gets Built | Acceptance Criteria | Days | Risk |
| --- | --- | --- | --- | --- | --- |
| S1-1 | FX rate integration | Real ExchangeRate-API call (free key). /api/fx/update stores USD/INR in SQLite. lib/currency.ts: formatUSD(n) → $1,234,567, formatINR(n) → ₹1,23,45,678 (Indian 2-2-3), formatLakhs(n) → ₹12.3L, formatCrores(n) → ₹1.2Cr, toINR(), toUSD() | ₹1,23,45,678 — not ₹12,345,678. ₹1.5Cr for 1,50,00,000. Rate stored in SQLite | 0.5 | Low |
| S1-2 | Currency toggle | Top-nav toggle: USD → INR → INR Lakhs. Preference in localStorage (moves to DB in Phase 3). All balance displays react to React context | Toggle changes every number on page instantly. Survives page refresh | 0.5 | Low |
| S1-3 | Net worth aggregation | lib/aggregation.ts: getNetWorth(userId) queries SQLite, sums by country + asset class. Returns { totalUsd, usTotalUsd, indiaTotalUsd, byAssetClass, asOf, fxRate }. USD stored, INR converted at display time | Correct totals from 7 seeded mock accounts using live FX rate | 0.5 | Low |
| S1-4 | Dashboard hero | Large total net worth, inline toggle, "As of [timestamp]". US: $835K (82%) | India: $187K (18%) split bar. FX badge: "USD/INR: 83.42 — Updated 12 min ago" | Numbers from mock data. Split bar proportional | 0.5 | Low |
| S1-5 | Asset group cards | Cards: US Banks, US Investments, US Retirement, India NRE/NRO, India FDs, India MFs, India Property, Gold. Each: total USD + INR, count, expandable rows. Empty groups hidden | 3 US accounts in 3 correct group cards with right sums. Expand/collapse works | 1 | Low |
| S1-6 | Account type badges | NRE: green "Tax-Free" + "Fully Repatriable". NRO: yellow "30% TDS" + "$1M/year". FCNR: green "Tax-Free". MF: "PFIC ⚠️". Manual vs Linked source tag | All mock accounts show correct badges | 0.5 | Low |
| S1-7 | Manual entry — US | AddAccountModal: Checking/Savings, Brokerage, 401k/IRA/Roth, Real Estate forms. Each saves to SQLite | Added Chase $5,000 → appears on dashboard in USD + INR. Persists in dev.db | 0.75 | Low |
| S1-8 | Manual entry — India | NRE, NRO, FCNR, FD, MF, Property, Gold forms. INR input → auto-converts to USD via live rate. Saves to SQLite | Added HDFC NRE ₹45,00,000 → converts to USD → appears on dashboard | 0.75 | Medium — accept 4500000, ₹45,00,000, and 45L as valid input |
Total: ~5 days. End state: Full product UI working. Can demo to anyone. No APIs except FX rate (free).

Sprint 2 — AI Copilot + Compliance Flags (Jun 16–20)
Goal: Claude AI working with mock account context. PFIC detection live. Product feels complete.
| # | Task | What Gets Built | Acceptance Criteria | Days | Risk |
| --- | --- | --- | --- | --- | --- |
| S2-1 | Claude API integration | /api/copilot/chat POST: accepts { message }, uses MOCK_USER_ID, streams response (stream: true). lib/copilot.ts: buildSystemPrompt() fetches accounts from SQLite, formats as structured Claude context | Chat works. "You have $54,000 in HDFC NRE" — not generic advice | 1 | Medium |
| S2-2 | System prompt builder | Constructs: (1) Role definition (2) User accounts from SQLite (3) Embedded compliance rules: FBAR $10K, FATCA $50K/$200K, LRS $250K, PFIC definition (4) Current date + live FX (5) Cite balances + append disclaimer. Context cap: ~3K tokens Haiku, ~8K Sonnet | "Do I need to file FBAR?" → uses mock India peak balance correctly | 0.5 | HIGH — prompt is the product. Iterate here |
| S2-3 | Model routing | Haiku: balance queries, single-regulation questions. Sonnet: multi-regulation, cross-border, optimization. Keywords trigger Sonnet: DTAA, PFIC, Form 8621, residency, repatriation, optimization | Simple < 3s (Haiku). Complex < 8s (Sonnet). Model logged | 0.5 | Low |
| S2-4 | Chat UI | Message bubbles. Streaming typewriter. "Thinking..." spinner. Starter questions on empty state: "Do I need to file FBAR?", "What is my India balance in USD?", "Should I move money from NRO to NRE?", "Am I at risk of India tax residency?" | Chat opens. Responses stream. Starters clickable | 0.5 | Low |
| S2-5 | Guardrails | Every response: "⚠️ Informational only. Not tax or financial advice. Consult a licensed CPA or CA." "Talk to a CPA" button on every response. No exceptions | Disclaimer on 100% of responses | 0.25 | HIGH — legal risk if missing |
| S2-6 | Conversation history | Messages saved to Conversation table in SQLite. Last 10 loaded on open. "New Conversation" clears visible, preserves in DB | Leave + return → conversation still there | 0.25 | Low |
| S2-7 | PFIC auto-detection | Any India MF added: inline alert "⚠️ PFIC Detected — India mutual funds require IRS Form 8621. Ask your CPA." isPfic flag on account. Dismissible but re-appears next login | Adding MF fires alert. Works on both mock data and newly added accounts | 0.5 | Low |
| S2-8 | Responsive + polish | Desktop 3-col, tablet 2-col, mobile 1-col. Skeleton loaders. Empty states with onboarding CTAs | No horizontal scroll at 375px. Grid reflows | 0.5 | Low |
Total: ~4 days.

Phase 1 Complete (After Jun 20)
Full app at localhost:3000
SQLite DB with mock NRI accounts
Real FX rates
All manual entry forms
AI Copilot answering from account data
PFIC detection
Cost so far: ~$2–5 (Anthropic dev testing only)
Can demo the entire product to potential users

Sprint 3 — Plaid Sandbox Integration (Jun 23–27)
Goal: Replace mock US accounts with real Plaid sandbox data. Still localhost, still SQLite.
Sign up for Plaid free on Jun 2 (sandbox access is instant). Production access request also submitted Jun 2 (async, 5–10 days).
| # | Task | What Gets Built | Acceptance Criteria | Days | Risk |
| --- | --- | --- | --- | --- | --- |
| S3-1 | Plaid client setup | Install plaid-node. lib/plaid.ts init with sandbox credentials. New PlaidItem Prisma model (userId, itemId, accessTokenEncrypted, institutionName, status). AES-256 encrypt tokens | Plaid client inits. PlaidItem table in SQLite. Tokens stored encrypted | 0.5 | HIGH — encrypt even in local dev |
| S3-2 | Link token + exchange | /api/plaid/create-link-token: linkTokenCreate() with MOCK_USER_ID. /api/plaid/exchange-token: accepts public_token, exchanges, stores encrypted access_token in SQLite | Exchange succeeds for Chase sandbox test credentials. PlaidItem row created | 0.5 | Low |
| S3-3 | Plaid Link UI | react-plaid-link. PlaidConnectButton: opens modal, onSuccess → exchange, onExit → graceful close, "Connecting..." loader | Click → modal → Chase sandbox → close → accounts appear | 0.5 | Low |
| S3-4 | Account sync | /api/plaid/sync-accounts: accountsGet(), map Plaid types to ours, upsert into SQLite with source = 'plaid' | After connect, accounts auto-populate with correct types + sandbox balances | 0.5 | Medium |
| S3-5 | Balance refresh | /api/plaid/refresh-all: iterate PlaidItem rows, update balances + lastSyncedAt. Manual refresh button triggers it too | Refresh button updates. lastSyncedAt updates | 0.5 | Low |
| S3-6 | Error states | ITEM_LOGIN_REQUIRED → yellow banner + re-link button in update_mode. Institution down → "Syncing..." state | Banner shows. Re-link works. No raw error codes shown | 0.5 | Medium |
| S3-7 | PDF upload + Textract | File input (PDF only, max 10MB). Upload to local uploads/. /api/textract/process → Textract → parse → "We found HDFC NRE — ₹45,00,000 — correct?" confirmation | HDFC PDF → extracted balance shown. Confirm → saved to SQLite | 1 | HIGH — build HDFC/SBI/ICICI/Axis regex parsers as Textract fallback |
Total: ~4 days. End state: Real Plaid sandbox banks linking. PDF OCR working for India. US accounts from real sandbox API.

Sprint 4 — Setu Sandbox + Full Integration (Jun 30–Jul 4)
Goal: Setu AA connected if access arrived. Full E2E working locally with sandbox data from both countries.
| # | Task | What Gets Built | Acceptance Criteria | Days | Risk |
| --- | --- | --- | --- | --- | --- |
| S4-1 | Setu AA integration (if access arrived) | Setu REST API: /api/setu/create-consent for [DEPOSIT, RECURRING_DEPOSIT, TERM_DEPOSIT, MUTUAL_FUNDS]. Consent callback webhook. Account fetch + map to Prisma Account. setuConsentId stored | Full consent flow → HDFC NRE/NRO auto-populate in SQLite | 2 | HIGH — if no access, skip. PDF covers it |
| S4-2 | Mock → real data audit | Verify every component uses real data (Plaid for US, PDF/Setu for India). Remove unused mock fallbacks. Keep mock files as test fixtures | No component renders hardcoded mock balances in real flow | 0.5 | Low |
| S4-3 | Full E2E test (local) | Full journey: open app → Plaid sandbox connect → India manual/PDF → dashboard → 5 AI questions. Verify: balances correct, FX correct, PFIC fires for MF, AI cites actual balances, disclaimers every response | All checks pass. No console errors | 0.5 | Medium |
| S4-4 | Connected accounts settings | /dashboard/settings/accounts: list linked institutions + status + last sync. Disconnect: removes token, marks accounts as manual (balance preserved). Reconnect for expired | Disconnect works. Data preserved. No orphaned tokens | 0.5 | Low |
| S4-5 | Performance + polish | Dashboard load < 2s. Skeleton loaders. "Last updated" everywhere. Stale > 24h warning. All empty state flows | Dashboard fast. Edge cases don't crash | 0.5 | Low |
Total: ~3.5 days (5.5 if Setu arrives). End state: Full product on localhost with real sandbox data. Ready to deploy.

Phase 2 Complete (After Jul 4)
Full app with real Plaid sandbox + Setu/PDF for India
All integrations proven before paying for cloud
Total spend so far: ~$5–15 (Anthropic only)

Sprint 5 — Cloud Migration + Launch (Jul 7–11)
Goal: localhost → nriwb.ai. SQLite → Supabase. Add real auth. Deploy.
| # | Task | What Gets Built | Acceptance Criteria | Days | Risk |
| --- | --- | --- | --- | --- | --- |
| S5-1 | Supabase setup | Sign up → create project → upgrade to Pro ($25/mo). In Prisma: change datasource to postgresql, set DATABASE_URL to Supabase connection string. npx prisma migrate deploy | Prisma Studio connects to Supabase. All tables created | 0.5 | Low — Prisma handles it |
| S5-2 | Data migration | Export SQLite data → import to Supabase. Or re-seed test data. Verify all records migrated | Supabase shows same accounts as local SQLite | 0.5 | Low |
| S5-3 | Row Level Security | RLS on all tables. Users can only access their own rows. FxRate read-only for all. Service role bypasses for crons. Write + run RLS test queries | User A cannot access User B's data via direct Supabase URL | 0.5 | HIGH — before any real user data |
| S5-4 | Clerk auth | Install @clerk/nextjs. Replace MOCK_USER_ID with auth().userId throughout the app. /sign-in + /sign-up pages. authMiddleware on all protected routes | Google OAuth works. /dashboard redirects unauthenticated users | 1 | Medium — wire Clerk userId into all Prisma queries |
| S5-5 | File storage → Supabase Storage | Move PDF upload from local uploads/ to Supabase Storage bank-statements bucket (private, user-scoped). Update Textract endpoint to read from Storage | PDFs upload to Supabase. Textract reads from cloud. Users only access their own files | 0.5 | Low |
| S5-6 | Vercel deploy | Sign up → Vercel Pro ($20/mo). vercel deploy. Set all env vars. Configure crons (FX hourly, balance refresh nightly). Point nriwb.ai domain | https://nriwb.ai loads. Login works. Dashboard loads | 0.5 | Low |
| S5-7 | Switch Plaid to production | Plaid production was requested Jun 2 — should be approved by now. Swap PLAID_ENV=sandbox → production in Vercel env vars | Real bank connections work | 0.5 | Medium — depends on approval |
| S5-8 | Beta launch prep | Sentry error monitoring (npm install @sentry/nextjs). Landing page or waitlist page. Verify all disclaimers. Test full sign-up → link → dashboard → AI as a new user | One complete real user journey on https://nriwb.ai | 0.5 | Low |
Total: ~4.5 days. End state: nriwb.ai live. First real user can sign up.

Cost Across All Phases
| Phase | Services Running | Monthly Cost |
| --- | --- | --- |
| Phase 1 (local) | Anthropic dev testing only | ~$2–5 |
| Phase 2 (sandbox) | Anthropic + AWS Textract free tier | ~$2–5 |
| Phase 3 (cloud) | Vercel Pro + Supabase Pro + Plaid + Setu + Anthropic + domain | ~$107–197/month |
Money out before Phase 3: ~$10–15 total. You start paying real infrastructure costs only when you need real users.