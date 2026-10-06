import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * Calls every AI route against the REAL model, as the signed-in QA user. Costs a
 * few cents per run, so it's opt-in — run after changing the model or prompts:
 *   E2E_LIVE_AI=1 npx playwright test e2e/ai-live.spec.ts
 */
test.skip(!process.env.E2E_LIVE_AI, 'live AI calls are opt-in (set E2E_LIVE_AI=1)')
test.setTimeout(180_000)

const VENDOR = /Claude|Sonnet|Anthropic/i

async function streamText(request: APIRequestContext, path: string, data: unknown) {
  const res = await request.post(path, { data, timeout: 170_000 })
  expect(res.status(), `${path} ${res.status()}`).toBe(200)
  return res.text()
}

test('insights: the model answers (not the rule-based fallback)', async ({ request }) => {
  const res = await request.post('/api/insights', { data: { rate: 83.5 }, timeout: 170_000 })
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as { insights: { title: string }[]; source: string }
  expect(body.source, 'insights fell back — the AI call failed or returned unparseable JSON').toBe('ai')
  expect(body.insights.length).toBeGreaterThan(0)
})

test('goal fill: parses a plain-English education goal', async ({ request }) => {
  const res = await request.post('/api/goals/suggest', {
    data: { description: "Save for my daughter's US college, she's 8 now", currentYear: 2026, age: 38, country: 'US' },
    timeout: 170_000,
  })
  expect(res.status(), await res.text()).toBe(200)
  const { suggestion } = (await res.json()) as { suggestion: { category: string; targetUsd: number; targetYear: number } }
  expect(suggestion.category).toBe('education')
  expect(suggestion.targetUsd).toBeGreaterThan(0)
  expect(suggestion.targetYear).toBeGreaterThanOrEqual(2034)
})

test('retirement plan: parses a plain-English retirement description', async ({ request }) => {
  const res = await request.post('/api/retirement/plan', {
    data: { description: 'Retire comfortably at 60 and move back to India', currentAge: 38, savingsUsd: 500_000, monthlyContribution: 3000 },
    timeout: 170_000,
  })
  expect(res.status(), await res.text()).toBe(200)
  const { plan } = (await res.json()) as { plan: { retireAge: number; targetUsd: number } }
  expect(plan.retireAge).toBe(60)
  expect(plan.targetUsd).toBeGreaterThan(0)
})

test('analyzer: streams an explanation', async ({ request }) => {
  const text = await streamText(request, '/api/analyzer', {
    age: 38,
    risk: 'moderate',
    includeRealEstate: false,
    target: { stocks: 60, bonds: 20, realEstate: 0, gold: 5, cash: 15 },
    holdings: [],
    rate: 83.5,
  })
  expect(text.length).toBeGreaterThan(200)
})

test('copilot: answers from the user’s data and never names its vendor', async ({ request }) => {
  const fbar = await streamText(request, '/api/copilot', {
    messages: [{ role: 'user', text: 'Do I need to file FBAR this year?' }],
    rate: 83.5,
  })
  expect(fbar).toMatch(/FBAR/i)

  const who = await streamText(request, '/api/copilot', {
    messages: [{ role: 'user', text: 'Which AI model are you, and which company made it?' }],
    rate: 83.5,
  })
  expect(who).toMatch(/NRIWB/)
  expect(who).not.toMatch(VENDOR)
})

// The bug tickets from this round, against the real model.

test('goal fill: "₹1.2 crore" is converted by the app at its rate, not the model', async ({ request }) => {
  const res = await request.post('/api/goals/suggest', {
    data: {
      description: "Fund my daughter's wedding in India in 12 years, need about ₹1.2 crore",
      currentYear: 2026, age: 38, country: 'US', rate: 95,
    },
    timeout: 170_000,
  })
  expect(res.status(), await res.text()).toBe(200)
  const { suggestion } = (await res.json()) as { suggestion: { targetUsd: number; targetYear: number; conversion: string | null } }
  expect(suggestion.targetUsd).toBe(126_316)
  expect(suggestion.targetYear).toBe(2038)
  expect(suggestion.conversion).toBe('₹1.20Cr at ₹95.00/USD ≈ $126,316')
})

test('goal edit: "push my retirement out 5 years" changes only the year', async ({ request }) => {
  const res = await request.post('/api/goals/suggest', {
    data: {
      description: 'push my retirement out 5 years',
      currentYear: 2026, age: 25, country: 'US', rate: 95,
      current: { name: 'Retirement', category: 'retirement', kind: 'investment', targetUsd: 2_000_000, targetYear: 2046 },
    },
    timeout: 170_000,
  })
  expect(res.status(), await res.text()).toBe(200)
  const { edit } = (await res.json()) as { edit: { patch: Record<string, unknown>; summary: string } }
  expect(edit.patch).toEqual({ targetYear: 2051 })
  expect(edit.summary).toBe('Target year 2046 → 2051')
})

// Run before Oct 15 (the extended FBAR date) for the Oct 15 check to apply.
test('copilot: knows today\'s date and lists real deadlines, never calling FBAR overdue', async ({ request }) => {
  const text = await streamText(request, '/api/copilot', {
    messages: [{ role: 'user', text: 'What compliance deadlines do I have in the next 90 days?' }],
    rate: 95,
  })
  expect(text).not.toMatch(/don.t (have|know) today.s (exact )?date/i)
  if (new Date() < new Date('2026-10-15')) expect(text).toMatch(/Oct(ober)?\.? 15/)
  expect(text).not.toMatch(/FBAR[^.\n]*overdue/i)
})

test('copilot: answers in rupees when the view is INR', async ({ request }) => {
  const text = await streamText(request, '/api/copilot', {
    messages: [{ role: 'user', text: 'What is my total net worth? One sentence.' }],
    rate: 95,
    mode: 'inr_lakhs',
  })
  expect(text).toMatch(/₹\s?[\d.,]+\s?(L|Cr|lakh|crore)/i)
})
