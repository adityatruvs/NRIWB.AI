# NRIWB.AI — Product & Technical Overview

## Section 1: Full Feature List
| # | Feature | Description | Example |
| --- | --- | --- | --- |
| 1 | Unified Net Worth Dashboard | One screen showing everything you own and owe across the US and India, summed into a single number in real time | "Your total net worth is $1,022,200 — US: $835K (82%) | India: $187K (18%)" |
| 2 | US Account Linking | Connects directly to US bank, investment, and retirement accounts automatically — no manual entry | Connect Chase, Fidelity, and your 401k in under 2 minutes. Balances update daily. |
| 3 | India Account Linking | Connects to India bank accounts (NRE, NRO, FCNR) through India's official banking network. If a bank isn't supported, the user uploads their bank statement PDF and the app reads it automatically | Link HDFC NRE directly, or upload an SBI NRO statement and the app pulls the balance instantly |
| 4 | Multi-Currency Display | Every balance shown in both USD and INR simultaneously using live exchange rates. Toggle between standard US formatting and Indian formatting (lakhs/crores) | Your NRE FD shows as "$54,000 / ₹45,00,000" — exchange rate updated every hour |
| 5 | FBAR Threshold Monitor | Tracks the peak combined balance of all India financial accounts throughout the year. Alerts before crossing the $10,000 IRS reporting threshold — missing this filing can mean $10,000+ in penalties | "Your India accounts peaked at $8,200 — you're at 82% of the FBAR limit. You'll likely cross $10,000 by September." |
| 6 | PFIC Auto-Detection (NEW) | When India mutual fund accounts are linked, the app automatically flags them as PFICs — a US tax classification most NRIs don't know about until their CPA charges them extra to file | You link your HDFC Mutual Fund. Immediately: "⚠️ PFIC Detected — these funds require Form 8621 with your US tax return." |
| 7 | Compliance Status Panel | A traffic light panel on the home screen showing compliance status across FBAR, FATCA, and LRS — green means fine, yellow means action needed, red means overdue | FBAR ✅ | FATCA ✅ | LRS ⚠️ "You've used $180K of your $250K annual limit" |
| 8 | AI Wealth Copilot | A chat interface where users ask plain-English financial questions and get answers using their actual account data — not generic Google results | "Do I need to file FBAR?" → "Yes. Your HDFC NRE FD peaked at $54,000 in March, exceeding the $10,000 threshold. FBAR is due October 15. Here's how to file." |
| 9 | NRE/NRO/FCNR Account View + Optimizer | Shows all three NRI account types side by side with balances, tax treatment, and repatriation rules. Suggests the optimal allocation to minimize tax | "You have ₹38L in NRO (taxed at 30%). Moving ₹20L to NRE saves ₹52,000/year in TDS — here's how." |
| 10 | Tax Residency Day Counter | Tracks days spent in India each year. Crossing 182 days makes India tax your worldwide income — a rule many NRIs discover too late | "You've spent 134 days in India this year. 48 days left before you risk Indian tax residency. At this pace you'll hit the limit by August 22." |
| 11 | Filing Deadline Calendar | A personalized calendar showing every tax and compliance deadline in both countries, with countdown timers | FBAR — 89 days | India ITR — Filed ✅ | US Estimated Tax Q3 — 23 days | Form 15CA — Required before next transfer |
| 12 | Regulatory Change Push Alerts (NEW) | Instant notifications whenever a law changes that affects NRIs — FBAR thresholds, LRS limits, RBI circulars, new FEMA rules | "RBI Update: LRS limit revised. Tap to see how this affects your repatriation plans." |
| 13 | Basic Goal Tracking (NEW) | Set financial goals across both countries — Retirement, Child's Education, India Property — and track progress toward each | "Retirement Goal: $2M by age 60 — you're 51% there. At current savings rate, you'll reach it by 2041." |
| 14 | Portfolio Drift Alerts | Notifies when the US/India asset split moves significantly from the user's target, so they can rebalance before it compounds | "Your India allocation grew to 58% — above your 50% target. India MFs gained 18% while US stocks were flat." |
| 15 | Secure Auth (2FA) | Bank-grade login. Account requires a password plus a second verification step (phone or authenticator app) before access is granted | Login with email + password → app asks for a 6-digit code from your authenticator app |
| 16 | Manual Entry Fallback | For any account that can't be linked automatically, clean forms to enter balances manually — works for every account type across both countries | Post office savings account not on any network — user enters balance manually, it still appears in the net worth total |

## Section 2: Tranche 1 — Build Plan
Scope: Features #1, #2, #3, #4, #8 + Auth & Security Timeline: June 2 – July 11, 2026
### What Each Tool Is
| Tool | Plain-English Explanation |
| --- | --- |
| Next.js | The framework used to build the web application — handles both what the user sees and the behind-the-scenes logic that powers it |
| Supabase | The database where all user data is stored securely — account balances, linked institutions, chat history. Think of it as a highly secure digital filing cabinet |
| Vercel | The service that hosts and serves the website globally. When someone visits nriwb.ai, Vercel delivers the page instantly from a server near them |
| Clerk | Handles everything related to login — "Sign in with Google," passwords, and two-factor authentication. A specialist service that saves months of security work |
| Plaid | The industry-standard service used by Venmo, Robinhood, and thousands of apps to securely connect to US bank accounts. Users log into their bank through Plaid's secure window — the app never sees their banking credentials |
| Setu | India's official banking data network, mandated by the RBI. Allows NRIs to securely share India bank account data with apps — equivalent to what Plaid does in the US |
| AWS Textract | Amazon's document-reading service. When a user uploads a PDF bank statement, Textract reads it and extracts the account balance and number automatically |
| ExchangeRate-API | A service providing live USD/INR exchange rates updated hourly. Free at this scale |
| Anthropic Claude API | The AI model powering the Wealth Copilot chat. The user's actual financial data is fed into it so answers are personalized, not generic |
### Build Schedule
| # | Component | What Gets Built | Days | Notes |
| --- | --- | --- | --- | --- |
| — | Infrastructure | The application skeleton — web app framework, database, hosting, and environment setup | 1 | Foundation everything else sits on |
| — | Auth | Login system — Google sign-in, email/password, secure sessions | 1 | 2FA added in a later tranche |
| — | DB Schema | Database structure — tables for users, accounts, balances, linked institutions | 1 | Designed carefully — all other features depend on this |
| #4 | Multi-Currency Engine | Live USD/INR exchange rate integration, lakhs/crores toggle, currency conversion logic used across the whole app | 2 | Must exist before the dashboard can show dual-currency numbers |
| #2 | Plaid — US Linking | Secure bank connection flow for US accounts — user clicks "Connect Bank," logs in through Plaid's window, accounts appear in the app | 3 | Apply for Plaid production access Jun 2 — approval takes 5–10 days, happens in background |
| #2 | Plaid — Account Sync | Balance refresh, account type labelling (checking/savings/brokerage/401k), handling expired connections | 2 |  |
| #3 | Manual Entry Fallback | Clean forms to manually enter any account — US bank, 401k, NRE, NRO, FCNR, India MF, property, FD | 2 | Built while waiting for Setu sandbox access |
| #3 | PDF Upload + OCR | User uploads India bank statement PDF → app reads it automatically and extracts balance and account number | 3 | Fallback for India accounts Setu can't reach |
| #3 | Setu — India Linking | Secure bank connection flow for India NRE/NRO/FCNR accounts through India's RBI-mandated data network | 5 | Email Setu for sandbox access Jun 2 — they are slow to respond; PDF upload is the safety net if this is delayed |
| #1 | Net Worth Dashboard | Aggregates all linked accounts into one screen — total net worth, US vs India split, asset cards by type | 3 | Requires account data flowing from Plaid + Setu |
| #1 | Multi-Currency Display | Every number on the dashboard shows in both USD and INR, Indian formatting applied, real-time FX | 1 |  |
| #8 | AI Wealth Copilot — Core | Chat interface connected to Claude AI, with the user's live account data fed in so answers are personalized | 3 |  |
| #8 | AI Wealth Copilot — Polish | Conversation history, "Informational only" disclaimer on every response, escalation prompt to CPA for complex questions | 2 |  |
Tranche 1 complete: July 11, 2026
### Critical Path Warnings
| Risk | What Happens | How It's Handled |
| --- | --- | --- |
| Plaid production approval is slow | US accounts stuck on manual entry only | Apply on Day 1; manual entry forms built in parallel as backup |
| Setu has limited NRI account coverage | Some India accounts won't link | PDF upload + OCR is the real fallback — built before Setu integration |
| Setu sandbox access takes weeks | No live India account linking at all | PDF upload ships first; Setu slotted in once access arrives |
| AI Copilot answers degrade with too many accounts | Responses become slow or less accurate | Only account balances and key details sent to the AI — not full transaction history |

## Section 3: Hosting & Services
### How It All Connects
Every service has one job. The user opens the app in their browser, the app (hosted on Vercel) handles their request, reads and writes data to the database (Supabase), and calls out to specialist services for specific tasks — Plaid for US bank data, Setu for India bank data, Anthropic for AI, and so on.
No single service handles everything. Each is best-in-class at its job.
### Service Breakdown
| Service | What It Does | Free Tier | Paid Plan | Cost at MVP (50–100 users) |
| --- | --- | --- | --- | --- |
| Vercel | Hosts the web application and runs scheduled background tasks (balance refresh, FX rate updates) | Limited — only 2 scheduled tasks | Pro: $20/month | $20/month — needed for 3 scheduled tasks |
| Supabase | Stores all user data: accounts, balances, chat history, uploaded PDFs. Also stores uploaded PDF files | Free tier exists but automatically shuts down after 1 week of inactivity — unusable for a live product | Pro: $25/month | $25/month — must be on paid plan for a live product |
| Clerk | Manages user login — Google sign-in, email/password, secure sessions | Free up to 10,000 monthly users | $25/month above 10,000 users | $0 — well within free tier at this stage |
| Plaid | Connects to US banks, brokerages, and 401k accounts securely. Used by Venmo, Coinbase, and thousands of apps | Free in test/development mode | ~$0.30–0.50 per linked account per month | $30–50/month for ~100 linked accounts across 50 users |
| Setu | Connects to India bank accounts through the RBI's Account Aggregator network — the official, regulated channel | Free in test/development mode | ~₹2–5 per data fetch | ~$5–15/month at this scale |
| AWS Textract | Reads PDF bank statements and extracts account numbers and balances automatically | 1,000 pages/month free for first 3 months | $1.50 per 1,000 pages | ~$0–2/month — minimal usage at MVP |
| ExchangeRate-API | Provides live USD/INR exchange rates, refreshed every hour | 1,500 requests/month free | $15/month for 100,000 requests | $0 — hourly refresh uses ~720 requests/month, within free tier |
| Anthropic Claude | Powers the AI Wealth Copilot chat feature | No free tier | Pay per use (see below) | $15–80/month depending on usage |
| Domain (nriwb.ai) | The website address | — | ~$80–100/year via Cloudflare Registrar | ~$7/month amortized |
### AI Copilot Cost
Two model options — one cheaper and faster, one more capable:
| Model | Best For | Cost per Conversation | 50 Users × 5 Questions/Day |
| --- | --- | --- | --- |
| Claude Haiku | Straightforward questions — "Do I need to file FBAR?" "What is my NRO balance?" | ~$0.005 | ~$15–20/month |
| Claude Sonnet | Complex multi-regulation questions spanning both tax systems | ~$0.018 | ~$70–80/month |
Approach: Use Haiku by default. Automatically escalate to Sonnet only when questions involve multiple regulations or cross-border scenarios. This keeps costs low without compromising quality.
### Monthly Cost Summary
| Category | Services | Monthly Cost |
| --- | --- | --- |
| Pay from Day 1 | Vercel Pro + Supabase Pro + Domain | ~$52/month |
| Pay when going live | Plaid + Setu + Anthropic Claude | +$55–145/month |
| Free | Clerk + ExchangeRate-API + AWS Textract | $0 |
|  |  |  |
| Total at 50 users |  | ~$107–197/month |
| Revenue at 50 users × $29/month |  | $1,450/month |
| Gross margin |  | ~87–93% |
The entire monthly infrastructure cost is covered the moment 7 users pay their first subscription.
### Sign-Up Order
| When | Service | Action | Cost |
| --- | --- | --- | --- |
| Day 1 | Vercel | Create account, upgrade to Pro | $20/month |
| Day 1 | Supabase | Create project, upgrade to Pro | $25/month |
| Day 1 | Clerk | Create free account | $0 |
| Day 1 | Plaid | Sign up, request production access immediately — takes 5–10 days | $0 (sandbox) |
| Day 1 | Setu | Email for sandbox access — they are slow, start early | $0 (sandbox) |
| Day 1 | Anthropic | Create account, load $20 credit | Pay-as-you-go |
| Day 1 | ExchangeRate-API | Create free account | $0 |
| Day 1 | Cloudflare Registrar | Purchase nriwb.ai domain | ~$80–100/year |
| Week 3 | AWS | Create account for Textract — free tier covers MVP | $0 to start |
| Go-live | Plaid | Switch from test mode to production | ~$30–50/month |
| Go-live | Setu | Switch from test mode to production | ~$5–15/month |