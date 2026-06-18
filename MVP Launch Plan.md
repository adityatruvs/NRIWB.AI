NRIWB.AI
# MVP Launch Plan
Cross-Border Wealth Intelligence for US-Based NRIs

Version 1.1  |  April 28, 2026  |  Product Team

# Table of Contents
1. Executive Summary
2. Market Research & Validation
3. User Zero Persona
4. Problem Statement
5. MVP Feature Set (7 Features)
6. Full Feature Backlog — MoSCoW Prioritization
7. Liability Use Cases — MoSCoW Prioritization
8. Tech Stack (Engineering-Led)
9. 10-Week Build Timeline
10. 4-Phase Product Roadmap
11. Pricing & Monetization
12. Go-To-Market Strategy
13. Success Metrics
14. Risk Register
15. Appendix A: Key Regulatory Reference
16. Appendix B: Wealth Aggregation Use Cases
17. Appendix C: AI Feature Specifications

# 1. Executive Summary
NRIWB.AI is a cross-border wealth intelligence platform for US-based Non-Resident Indians (NRIs) with assets in both the US and India. It provides a unified dashboard, AI-powered compliance alerts (FBAR, FATCA, FEMA), an AI Wealth Copilot for plain-English financial Q&A, and cross-border tax intelligence — solving a problem that currently requires $500/hr CPAs and spreadsheet gymnastics.
| Attribute | Detail |
| --- | --- |
| Target | US-based NRI households with $500K+ combined cross-border assets |
| MVP Goal | 50 beta users in 10 weeks |
| Price | $29/month (Essential plan)(TBD) |
| MVP Features | 7 core features including AI Wealth Copilot |
| Differentiator | Only platform combining US + India asset aggregation WITH regulatory compliance AI |

# 2. Market Research & Validation
## 2.1 Total Addressable Market
| Metric | Value | Source |
| --- | --- | --- |
| Indian Americans in US | 5.16 million (2023, 1.6% of US pop) | US Census 2023 |
| Median household income | $157,005 (2020) — highest of any US ethnic group | US Census 2020 |
| Per capita income | $72,389 — 2nd highest among Asian Americans | US Census |
| Mgmt/business/science employment | 75.1% vs 43.2% total population | US Census |
| Education: bachelor's degree | 72% vs 19% US average | Pew Research 2015 |
| Education: postgraduate degree | 40% vs 11% US average | Pew Research 2015 |
| Poverty rate | 5% vs 14% immigrants overall | Migration Policy Institute |
| TAM: US-India corridor ($100K+ HHI) | ~2M–2.5M households | Derived |
| SAM: HNI NRIs ($500K+ assets) | ~400K–600K households | Estimated |
| SOM: Year 1 target | 2,000–5,000 users | Goal |

## 2.2 Money Flows Backing the Opportunity
| Data Point | Value | Source |
| --- | --- | --- |
| India remittances (2023-24) | $129 billion | RBI / World Bank |
| US share of India remittances | 27.7% (~$35.7B) — #1 source country | RBI 6th Remittance Survey |
| Remittance growth | $2.1B (1991) → $83B (2020) → $129B (2024) | World Bank |
| NRI deposits in Indian banks | ~$150B+ across NRE/NRO/FCNR | RBI data |
| India = world's #1 remittance recipient | 12%+ of global remittances | World Bank |

## 2.3 What HNI NRIs Want
| What HNI NRIs Want | Evidence / Signal | NRIWB.AI MVP Feature |
| --- | --- | --- |
| Single view of US + India wealth | No existing tool aggregates both | Cross-Border Dashboard |
| FBAR/FATCA compliance w/o $500/hr CPAs | 100% of NRIs with >$10K India accounts must file FBAR | Compliance Alerts AI |
| Plain-English financial Q&A | Regulatory complexity across 2 countries; users need instant answers | AI Wealth Copilot |
| PFIC classification clarity | India MFs = PFICs under US tax law | Tax Intelligence Engine |
| NRE vs NRO optimization | NRE = tax-free India; NRO = 30% TDS | Account Type Guidance |
| DTAA treaty benefit awareness | US-India DTAA exists but few NRIs claim | Cross-Border Tax Insights |
| Residency status tracking (182-day) | India Sec 6 + US substantial presence test | Residency Tracker |
| Agricultural land / PPF blind spots | NRIs can't buy ag land; PPF barred post-2020 | Regulatory Flags |

## 2.4 Competitive Landscape & White Space
| Competitor | What They Do | Gap NRIWB.AI Fills |
| --- | --- | --- |
| SBNRI | India-focused NRI services (MFs, FDs, real estate) | No US-side aggregation, no FBAR/FATCA alerts |
| INDmoney | India wealth app expanding to NRI | India-only view, no US tax compliance |
| Kubera | Global net worth tracker | Generic — no NRI-specific compliance intelligence |
| Vested / Winvesta | US stock investing for Indians | Investment-only, no holistic cross-border view |
| US CPAs/RIAs | Manual advisory ($300-500/hr) | Expensive, reactive, no real-time dashboard |
| NRIWB.AI | Cross-border wealth + compliance AI + Copilot | Only platform with US+India view AND AI compliance + conversational AI |

## 2.5 Demographic Tailwinds
Fastest-growing ethnic group: Indian American pop grew 54.7% from 2010 to 2020 (Census)
Geographic concentration enables targeted marketing: NY-NJ (792K), SF Bay (513K), Chicago (253K), DC (253K), Dallas (239K)
India doesn't allow dual citizenship → every Indian American with India assets faces cross-border complexity via OCI status
15.5% of Silicon Valley startups founded by Indian immigrants → tech-savvy, digital-first users
Indians comprise 80%+ of H-1B visas → continuous pipeline of new NRIs entering the US with India assets
## 2.6 Regulatory Tailwinds
India Account Aggregator (AA) framework — enables consent-based financial data sharing; future API integration
DTAA negotiations — ongoing India-US tax treaty discussions increase compliance awareness
FBAR enforcement tightening — FinCEN penalties increasing; creates urgency for compliance tools
LRS limit at $250K/year — creates planning need for large cross-border transfers

# 3. User Zero Persona
## "Rahul" — The Accidental Cross-Border Wealth Manager
| Attribute | Detail |
| --- | --- |
| Name | Rahul Mehta (composite persona) |
| Age | 38 |
| Location | Bay Area, California |
| Occupation | Senior Software Engineer at a FAANG company |
| US Salary | $180,000 + RSUs |
| Immigration | H-1B → Green Card (OCI holder for India) |
| Family | Married, 1 child (age 4), parents in Pune |
| Education | IIT → MS (US) → 12 years in tech |

### Rahul's Financial Picture
| Asset | Type | Where | Value |
| --- | --- | --- | --- |
| 401(k) | Retirement | US | $280,000 |
| Brokerage | Investment | US | $150,000 |
| RSUs (vested) | Equity | US | $120,000 |
| Primary residence equity | Real Estate | US | $250,000 |
| 529 Plan | Education | US | $35,000 |
| NRE Fixed Deposits | Cash | India | ₹45L (~$54,000) |
| NRO Savings | Cash | India | ₹8L (~$9,600) |
| India Mutual Funds | Investment | India | ₹18L (~$21,600) |
| Sovereign Gold Bonds | Gold | India | ₹5L (~$6,000) |
| Parents' flat (inherited share) | Real Estate | India | ₹80L (~$96,000) |
| TOTAL |  |  | ~$1,022,200 |

### Rahul's Pain Points
"I found out my India mutual funds are PFICs at tax time." CPA charged $2,500 extra to file Form 8621.
"I had no idea I needed to file FBAR." NRE + NRO crossed $10K years ago. Non-compliant for 3 years.
"My parents added me to their flat deed. Am I supposed to report that?" Yes — foreign asset reporting.
"I spend 3 weeks in India every year. What if I go for 6 months?" Tax residency triggers at 182 days.
"I have NRE, NRO, and FCNR. My banker says one thing, my CPA says another." No unified guidance.
"I'm the email middleman between my US CPA, India CA, and financial advisor." Everyone sees a slice.
"I just want to ask a simple question and get a straight answer." Google gives generic results; CPAs charge by the hour.
### Why Rahul Pays $29/month
Avoids $10K+ FBAR penalty → $29/mo is insurance
Replaces 2 CPA hours/year ($1,000) with AI-first compliance
Asks the AI Copilot "Do I need FBAR?" and gets a personalized answer in seconds
Sees his full $1M+ net worth for the first time in one place
Gets proactive alerts instead of reactive tax-season panic

# 4. Problem Statement
5+ million Indian Americans hold assets in both the US and India, but no tool exists to give them a single view of their cross-border wealth or automate the compliance obligations (FBAR, FATCA, FEMA, DTAA) that come with it.
## Current State
2–3 bank apps (US) + 2–3 bank apps (India) + brokerage apps + property paperwork
Excel spreadsheets with manual currency conversion
A US CPA who doesn't understand Indian tax rules
An India CA who doesn't understand FBAR/FATCA
Google searches and WhatsApp forwards for regulatory questions
## Impact of Status Quo
Unknowing non-compliance (FBAR, FATCA, PFIC) → $10K–$100K penalties
Suboptimal account allocation (NRE vs NRO vs FCNR) → thousands lost to TDS
Double taxation from missed DTAA treaty benefits
Estate planning gaps → which country's law governs each asset?

# 5. MVP Feature Set (6 Core Features)
These 7 features solve Rahul's top pain points and can be built in 10 weeks. The AI Wealth Copilot is included in the MVP because conversational AI is core to our differentiation — users shouldn't have to navigate complex UI to get compliance answers.
## Feature 1: Cross-Border Net Worth Dashboard
One screen showing everything Rahul owns and owes across US and India. Unified net worth in USD (with INR toggle). Jurisdiction split: 'US: $835K (82%) | India: $187K (18%).'
Asset cards grouped by type (Cash, Investments, Real Estate, Retirement, Gold)
Jurisdiction split bar (US vs India)
Multi-currency display (USD primary, INR secondary, toggle)
Manual entry forms for all accounts (Plaid/AA = Phase 2)
Indian number formatting support (lakhs/crores)
## Feature 2: NRE/NRO/FCNR Account Tracking
Shows all three NRI account types side by side with balances, interest rates, tax treatment, and repatriation rules.
Balance display for each account type
Tax treatment comparison (NRE=tax-free; NRO=30% TDS; FCNR=tax-free, no FX risk)
Repatriability indicator (NRE/FCNR=full; NRO=$1M/year cap)
After-tax yield calculator
Optimal allocation suggestion (rule-based)
## Feature 3: FBAR Threshold Alerts ($10K)
Monitors aggregate maximum value of all India financial accounts. Alerts when total crosses $10,000 at any point during the calendar year.
Real-time aggregate tracking of all India accounts
Peak balance tracking (FBAR uses highest balance, not year-end)
Alerts at 80%, 90%, 100% of $10K threshold
FATCA Form 8938 thresholds ($50K/$200K)
Filing deadline reminders with countdown
## Feature 4: Basic DTAA Guidance
Shows which income types are covered by the US-India Double Taxation Avoidance Agreement and how to claim treaty benefits.
Income type matrix: Salary, Dividends, Interest, Capital Gains, Rental
TDS credit → Foreign Tax Credit guidance
Key treaty articles: 10 (Dividends), 11 (Interest), 13 (Cap Gains), 25 (Relief)
"Does this apply to me?" decision tree
## Feature 5: Tax Residency Day Counter
Tracks days in India vs US. Alerts as user approaches 182-day threshold that triggers Indian tax residency.
Manual day entry (travel log)
Days remaining before 182-day trigger
Projection: "At current pace, you'll hit 182 days by [date]"
Dual test: India Sec 6 (182 days) + US Substantial Presence (183 days weighted)
Alerts at 150, 160, 170, 180 days
## Feature 6: AI Wealth Copilot
Chat interface where users ask plain-English questions about their cross-border finances. The Copilot answers using the user's actual data and cites relevant tax rules. This is the core differentiator — turning complex cross-border regulation into instant, personalized answers.
Chat window embedded in dashboard — always accessible
Answers using user's linked account data (balances, thresholds, days in country)
Cites specific regulations: "Per FinCEN guidelines, your aggregate balance of $14,200 requires FBAR filing"
Covers: FBAR/FATCA questions, NRE vs NRO guidance, DTAA applicability, residency impact, PFIC basics
Guardrails: "Informational only — not tax advice" disclaimer on every response
Confidence indicator + "Talk to a CPA" escalation for complex edge cases
Conversation history saved per user

# 6. Full Feature Backlog — MoSCoW Prioritization
## Must Have (15 features)
| ID | Feature | Description |
| --- | --- | --- |
| M1 | Unified Net Worth View | Home screen. One number: everything you own minus everything you owe, across both countries. |
| M2 | Multi-Currency Display | Every number shows USD and INR. Toggle primary. Lakhs/crores support. |
| M3 | Account Connection Hub | Link accounts — US via Plaid, India via AA, demat via CDSL/NSDL. Manual entry fallback. |
| M4 | Security & Authentication | Encryption, 2FA, biometric, role-based access. Bank-grade. |
| M5 | FBAR & FATCA Threshold Monitor | Tracks foreign accounts > $10K (FBAR) or $50K+ (FATCA). Penalty warnings. |
| M6 | Compliance Status Panel (AI) | Red/yellow/green for FBAR, FATCA, ITR, FEMA, residency. AI explains flags. |
| M7 | Filing Deadline Calendar | Personalized deadlines in both countries. Reminders at 30/15/7/3/1 days. |
| M8 | AI Wealth Copilot (Chatbot) ★ MVP | Plain-English Q&A using YOUR data. Cites relevant tax rules. In MVP from day one. |
| M9 | Proactive Alerts | Push notifications for threshold crossings, FX targets, day counts. |
| M10 | Document Vault (AI) | Secure locker with AI document extraction. |
| M11 | Jurisdiction Split View | Side-by-side US vs India with repatriability indicators. |
| M12 | Tax Residency Day Counter | Counts days per country. 182-day trigger projection. |
| M13 | Real Estate Dashboard | Both countries — value, mortgage, equity, rental. NRI rule flags. |
| M14 | NRE/NRO/FCNR Optimizer | Compares three account types. After-tax yield. Optimal allocation. |
| M15 | FEMA Compliance Monitor | Tracks LRS ($250K), PIS limits, property rules. Pre-breach warnings. |

## Should Have (7 features)
Note: AI Copilot moved from Should Have to MVP. Remaining Should Have features below.
| ID | Feature | Description |
| --- | --- | --- |
| S1 | Asset Class Breakdown | Pie charts across both countries. Drift from target allocation. |
| S2 | FX Impact Analysis | Separates investment return from currency effect. True dollar return. |
| S3 | Gold & Precious Metals Dashboard | US ETFs + India SGBs + physical + jewelry. SGB maturity calendar. |
| S4 | Retirement Accounts Consolidation | US 401(k)/IRA/Roth + India EPF/PPF/NPS. Rules attached. |
| S5 | AI Insights Feed | Proactive personalized cards with savings opportunities. |
| S6 | Repatriation Tracker & Planner | India→US transfers: $250K limit, Form 15CA/15CB, tax, FX, net dollars. |
| S7 | Scenario Modeler / What-If | "What if I sell Mumbai flat?" → taxes both countries, FX impact. |

## Could Have (9 features)
| ID | Feature | Description |
| --- | --- | --- |
| C1 | Family / Household View | Full family net worth. Family-level LRS capacity. |
| C2 | Cash Flow Tracker | Income vs expenses by country. Surplus/deficit per jurisdiction. |
| C3 | Tax-Loss Harvesting Scanner | Cross-border loss harvesting: wash sale, STCL/LTCL, PFIC. |
| C4 | Investment Performance Analytics | Returns in USD vs INR, benchmarked, tax-adjusted. |
| C5 | Insurance Coverage Dashboard | US + India insurance. Gap analysis. Premium calendar. |
| C6 | AI Financial Briefings | Auto-generated CPA meeting prep: changes, deadlines, discussion items. |
| C7 | Estate & Succession Planning | Which country's law governs each asset? India will + US will. |
| C8 | College Planning Module | US vs India education cost modeling. 529 tracking. |
| C9 | Advisor Collaboration Workspace | Scoped logins for US CPA, India CA, financial advisor. |

## Won't Have (4 features)
| ID | Feature | Why Not Now |
| --- | --- | --- |
| W1 | Native Mobile App | $200-500K+, 3-6 months. Responsive web covers 90%. |
| W2 | White-Label Advisor Platform | Separate B2B product, not a feature. |
| W3 | Lending & Liability Dashboard | Advanced debt layer deferred. Liabilities in net worth already. |
| W4 | Charitable Giving Optimizer | Tiny user slice. US 501(c)(3) + India 80G modeling. |

# 7. Liability Use Cases — MoSCoW Prioritization
## Must Have (4)
| ID | Use Case | Description |
| --- | --- | --- |
| L-M1 | US Mortgage + India Property Loan | Cross-border debt dashboard: mortgages, EMIs, equity, tax deductions |
| L-M2 | Student Loan Impact on India Plans | US student loan vs India investment capacity and repatriation planning |
| L-M3 | Credit Card Debt Across Countries | Aggregate utilization, FX charges, FICO/CIBIL impact |
| L-M4 | Tax Liability Estimation (Both) | Estimated tax US + India, advance tax deadlines, FTC optimization |

## Should Have (5)
| ID | Use Case | Description |
| --- | --- | --- |
| L-S1 | NRO Overdraft / India Credit Line | India-side credit facilities, FEMA implications |
| L-S2 | Auto Loan (US) | Standard US auto debt in net worth |
| L-S3 | Family Loans (Informal) | Loans to/from India family — gift tax, repatriation docs |
| L-S4 | Insurance Premium Liabilities | Upcoming premiums across US + India policies |
| L-S5 | EMI Calendar | Unified monthly obligations across both countries |

## Could Have (3)
| ID | Use Case | Description |
| --- | --- | --- |
| L-C1 | Margin Loans (US Brokerage) | Portfolio margin tracking, net worth impact |
| L-C2 | India Home Loan Top-Up | Additional borrowing vs India property, FEMA NRI rules |
| L-C3 | Contingent Liabilities | Pending legal matters, disputed tax assessments |

## Won't Have (2)
| ID | Use Case | Why Deferred |
| --- | --- | --- |
| L-W1 | Business Loans (India Entity) | Complex: company vs personal, FEMA FDI rules |
| L-W2 | Guarantees Given | Rare for target users, complex legal territory |

# 8. Tech Stack (Engineering-Led)
Technology stack decisions are being finalized with the engineering consultant.
This section is intentionally kept as product requirements and constraints rather than prescriptive technology choices. The engineering team will make the final stack decisions based on team expertise, cost, and build speed.
## Product Requirements for Engineering
| Requirement | What Product Needs | Constraints / Notes |
| --- | --- | --- |
| AI / LLM Integration | Conversational AI Copilot answering user questions with their data | Must support context-aware Q&A with guardrails and citations |
| Multi-Currency Engine | Real-time USD/INR conversion, Indian number formatting | Needs reliable FX rate source; supports lakhs/crores |
| US Account Linking | Auto-connect US bank + brokerage accounts | Phase 2; MVP uses manual entry |
| India Account Linking | Auto-connect India bank accounts | Phase 2 via Account Aggregator; MVP uses manual entry |
| Document Storage | Secure encrypted file upload (PDF, JPG, PNG) | AES-256 at rest; max 25MB per file; shareable links |
| Authentication | 2FA, social login, role-based access for advisors | Bank-grade security is a trust differentiator |
| Hosting & Compliance | SOC 2 compliant, data encryption in transit and at rest | Financial data = high security bar |
| Mobile Responsiveness | Works well on mobile browsers | Native app is Won't Have; responsive web is sufficient for MVP |
| Alert System | Email + in-app notifications for compliance thresholds | Must support configurable thresholds and schedules |
| Performance | Dashboard loads in <3 seconds; document retrieval <2 seconds | Non-negotiable for user experience |

## Engineering Decisions (Pending)
The following decisions are to be made by the engineering team/consultant:
Frontend framework (React, Next.js, Vue, etc.)
Backend language & framework (Python, Node.js, Go, etc.)
Database choice (PostgreSQL, MongoDB, etc.)
LLM provider and model (Azure OpenAI, AWS Bedrock, etc.)
Cloud provider (Azure, AWS, GCP)
CI/CD pipeline and deployment strategy
Account linking provider (Plaid, MX, Yodlee for US; AA specs for India)
Monitoring and observability stack

# 9. 10-Week Build Timeline
## Phase A: Foundation (Weeks 1–3)
| Week | Deliverable |
| --- | --- |
| W1 | Project setup, CI/CD, DB schema, auth integration, design system |
| W2 | Manual account entry forms, multi-currency engine, FX rate integration |
| W3 | Net worth calculation engine, jurisdiction split logic, dashboard UI |

## Phase B: Core Intelligence (Weeks 4–6)
| Week | Deliverable |
| --- | --- |
| W4 | NRE/NRO/FCNR module, tax treatment rules engine, yield calculator |
| W5 | FBAR threshold tracker, peak balance calculator, FATCA logic |
| W6 | DTAA guidance module, residency day counter, alert system |

## Phase C: AI Copilot & Documents (Weeks 7–8)
| Week | Deliverable |
| --- | --- |
| W7 | AI Wealth Copilot: LLM integration, prompt engineering, user context injection, guardrails |
| W8 | Document vault, Copilot testing & refinement, mobile responsive, onboarding flow |

## Phase D: Test & Launch (Weeks 9–10)
| Week | Deliverable |
| --- | --- |
| W9 | Beta testing (20 NRI users), security audit, Copilot accuracy testing, pen test |
| W10 | Bug fixes, landing page, billing integration, LAUNCH |

# 10. 4-Phase Product Roadmap
## Phase 1: MVP (Weeks 1–10) — "See Everything + Ask Anything"
Manual entry, net worth dashboard, FBAR alerts, DTAA basics, residency tracker, document vault, AI Wealth Copilot.
Goal: 500 beta users. Prove that NRIs will pay for cross-border visibility + conversational AI.
## Phase 2: Intelligence (Months 4–6) — "Understand Everything"
Plaid integration (US auto-link), compliance status panel, FX impact analysis, repatriation planner, AI insights feed.
Goal: 2,000 paying users. Prove retention and engagement.
## Phase 3: Optimization (Months 7–9) — "Optimize Everything"
Scenario modeler, tax-loss harvesting scanner, advisor workspace, family view, insurance dashboard, estate planning view.
Goal: 5,000 users. B2B pilot with 10 CPA/RIA firms.
## Phase 4: Scale (Months 10–12) — "Automate Everything"
India Account Aggregator integration, native mobile app evaluation, white-label for advisors, lending analytics.
Goal: 10,000+ users. Series A readiness.
# 11. Pricing & Monetization
## Consumer Plans
| Plan | Price | What's Included |
| --- | --- | --- |
| Free | $0/month | Net worth dashboard (5 accounts), basic FBAR alert, 100MB vault |
| Essential | $29/month | Unlimited accounts, all compliance alerts, DTAA, residency tracker, AI Copilot (10 questions/mo), 2GB vault |
| Premium | $79/month | Essential + AI Copilot (unlimited), scenario modeler, advisor sharing, 10GB vault |
| Family | $129/month | Premium for 4 household members, family LRS tracking, estate planning |

## B2B Plans (Phase 3+)
| Plan | Price | Audience |
| --- | --- | --- |
| Advisor | $199/user/month | US CPAs/RIAs managing NRI clients |
| Enterprise | Custom | Wealth management firms. White-label, API. |

## Revenue Projections (Year 1)
| Quarter | Users | MRR | ARR |
| --- | --- | --- | --- |
| Q1 (MVP) | 500 | $14,500 | $174,000 |
| Q2 | 2,000 | $58,000 | $696,000 |
| Q3 | 5,000 | $145,000 | $1,740,000 |
| Q4 | 10,000 | $290,000 | $3,480,000 |

Assumes: 60% Essential ($29), 30% Premium ($79), 10% Free

# 12. Go-To-Market Strategy
## Channel Strategy
| Channel | Tactic | Target |
| --- | --- | --- |
| SEO/Content | Blog: "FBAR Guide for NRIs", "India MFs are PFICs" | Organic NRI search traffic |
| NRI Communities | Partner with NRI associations in Bay Area, NJ, Chicago | Direct access to target users |
| CPA/CA Referrals | Free advisor accounts → recommend to NRI clients | B2B2C distribution |
| LinkedIn | Targeted ads to Indian-origin tech workers in US metros | Precision targeting |
| Reddit/Twitter | r/NRI, r/IndiaInvestments, NRI communities | Organic community growth |
| YouTube | "How FBAR Works", "NRE vs NRO vs FCNR" videos | Long-tail discovery |
| WhatsApp | Compliance checklists that link back to app | Viral NRI network sharing |

## Launch Sequence
Weeks 1–8: Build MVP (including AI Copilot)
Week 9: 20-person beta (personal network NRIs in Bay Area + NJ)
Week 10: Public launch — Product Hunt, Hacker News, NRI subreddits
Week 11: FBAR deadline content push (October 15 extension)
Week 12: CPA outreach — 50 NRI-serving CPAs in target metros
Month 4: Partnership with NRI community org (TiE, IITAA, etc.)
# 13. Success Metrics
## North Star Metric
Monthly Active Users who have linked 3+ accounts across both countries
## KPIs
| Metric | Month 3 | Month 6 | Month 12 |
| --- | --- | --- | --- |
| Registered users | 1,000 | 3,000 | 12,000 |
| Paid users | 500 | 2,000 | 10,000 |
| Accounts per user | 4 | 6 | 8 |
| Monthly Active Users | 400 | 1,600 | 8,000 |
| FBAR alerts acknowledged | 200 | 800 | 4,000 |
| AI Copilot questions/week | 500 | 3,000 | 20,000 |
| Documents uploaded | 1,500 | 8,000 | 50,000 |
| NPS | 40+ | 50+ | 60+ |
| Monthly churn | <8% | <5% | <3% |
| MRR | $14,500 | $58,000 | $290,000 |

# 14. Risk Register
| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| India Account Aggregator delays | High | Medium | MVP uses manual entry; AA is Phase 2 enhancement |
| Regulatory advice liability | High | High | All guidance = "informational, not tax advice." TOS + disclaimers. Partner CPAs. |
| AI Copilot hallucination / wrong answers | Medium | High | Guardrails, citation requirement, confidence scores, "Talk to CPA" escalation, human review of edge cases |
| Data security breach | Low | Critical | SOC 2 hosting, AES-256, pen testing, bug bounty |
| Tax law changes | Medium | Medium | Rules engine is code-driven → update rules, not rebuild. Quarterly review. |
| User trust (new fintech) | High | High | Bank-grade security messaging, transparent pricing, read-only, SOC 2 badge |
| Low activation | Medium | High | Guided onboarding wizard, demo dashboard, 5-minute setup promise |
| CPA channel resistance | Medium | Medium | Position as CPA's tool too. Augments, doesn't replace. |

# Appendix A: Key Regulatory Reference
| Regulation | Jurisdiction | Threshold / Rule | Penalty |
| --- | --- | --- | --- |
| FBAR (FinCEN 114) | US | Foreign accounts > $10,000 aggregate peak | $10K/violation (non-willful), $100K+ (willful) |
| FATCA (Form 8938) | US | Foreign assets > $50K (single) / $200K (MFJ) | $10K failure + $50K continued |
| PFIC (Form 8621) | US | Ownership in Passive Foreign Investment Co (India MFs) | Punitive tax: highest historical rate + interest |
| FEMA – LRS | India | $250K/person/year outward remittance limit | RBI penalties, prosecution |
| FEMA – PIS | India | NRI stock investment ≤5% of paid-up capital | Transaction reversal, penalties |
| India ITR | India | Must file if India income > ₹2.5L | Interest (234A/B/C), penalty up to ₹5,000 |
| Section 6 – Residency | India | 182 days → tax resident → worldwide income taxable | Full Indian taxation on global income |
| DTAA – US-India | Both | Treaty relief on dividends, interest, capital gains | Double taxation if not claimed |
| NRE Account | India | Interest tax-free, fully repatriable | N/A (benefit) |
| NRO Account | India | 30% TDS on interest, $1M/year repatriation cap | TDS auto; excess = FEMA violation |
| Agricultural Land | India | NRIs/OCIs cannot purchase | Transaction void, FEMA violation |
| PPF | India | NRIs cannot contribute post-2020 | Contributions returned, account frozen |

# Appendix B: Wealth Aggregation Use Cases (12)
| # | Use Case | Description |
| --- | --- | --- |
| 1 | US Bank Accounts | Checking, savings, CDs across multiple US banks |
| 2 | US Brokerage & Investments | Stocks, ETFs, MFs, options in US brokerage |
| 3 | US Retirement Accounts | 401(k), IRA, Roth IRA, HSA, 529 |
| 4 | US Real Estate | Primary residence, rentals — value, mortgage, equity |
| 5 | India NRE/NRO/FCNR | All three account types with balances and interest |
| 6 | India Fixed Deposits | Bank FDs, company FDs — maturity, interest, TDS |
| 7 | India Mutual Funds | Direct + regular plans. PFIC flag for US tax. |
| 8 | India Stocks & Demat | Equity via CDSL/NSDL. Capital gains tracking. |
| 9 | India Real Estate | Properties — value, rental income, cap gains modeling |
| 10 | Gold & Precious Metals | US gold ETFs + India SGBs + physical + jewelry |
| 11 | Insurance & Endowments | US life/health + India LIC/health — premiums, maturity |
| 12 | Alternative Assets | Startup equity (ESOPs/RSUs), crypto, private investments |

# Appendix C: AI Feature Specifications
## AI Wealth Copilot (MVP — Feature 7)
Chat interface embedded in dashboard — available from day one
Answers using user's linked account data (balances, thresholds, days in country)
Cites specific regulations and provides step-by-step guidance
Coverage: FBAR/FATCA, NRE vs NRO, DTAA, residency, PFIC basics, repatriation
Guardrails: "Informational only" disclaimer, source links, confidence score
"Talk to a CPA" escalation for complex or ambiguous questions
Conversation history saved; supports follow-up questions
LLM provider and model to be determined by engineering consultant
## Compliance AI (Included in MVP Compliance Features)
Continuously monitors all accounts against compliance rules
Output: Red/yellow/green traffic light per obligation
Rules engine: Code-based (deterministic) for checks. LLM for explanations only.
## Document AI (Phase 2)
OCR + extraction from uploaded documents
Extracts: account numbers, balances, dates, tax amounts from Form 16, TDS certs, statements
Model/provider to be determined by engineering consultant
## AI Insights Feed (Phase 2)
Generates personalized financial insights weekly
Examples: "NRO→NRE shift saves ₹78K/yr", "SGB matures in 3mo — LTCG exempt"

This document is the single source of truth for NRIWB.AI MVP planning.
Version 1.1  |  April 28, 2026
Changes from v1.0: AI Copilot added to MVP; Tech Stack deferred to engineering consultant