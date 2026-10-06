import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserContext } from '@/lib/user-context'

// ── Mocks: auth, the DB-backed context loader, and the Anthropic SDK ───────────
const auth = vi.hoisted(() => ({ userId: 'user_real' as string | null }))
vi.mock('@/lib/auth', () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireUserId: async () => {
      if (!auth.userId) throw new UnauthorizedError()
      return auth.userId
    },
    unauthorized: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
  }
})

const stored = vi.hoisted(() => ({ ctx: null as unknown as UserContext, calls: [] as unknown[] }))
vi.mock('@/lib/user-context', async (orig) => ({
  ...(await orig<typeof import('@/lib/user-context')>()),
  loadUserContext: async (...args: unknown[]) => {
    stored.calls.push(args)
    return stored.ctx
  },
}))

const sdk = vi.hoisted(() => ({ system: [] as string[], user: [] as string[], reply: '{"insights":[]}' }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (args: { system: string }) => {
        sdk.system.push(args.system)
        return { on: () => {}, finalMessage: async () => ({}), abort: () => {} }
      },
      create: async (args: { messages: { content: string }[] }) => {
        sdk.user.push(args.messages[0].content)
        return { content: [{ type: 'text', text: sdk.reply }] }
      },
    }
  },
}))

vi.mock('@clerk/nextjs/server', () => ({ clerkClient: async () => ({}) }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const { POST: copilot } = await import('@/app/api/copilot/route')
const { POST: insights } = await import('@/app/api/insights/route')

function ctx(over: Partial<UserContext> = {}): UserContext {
  return {
    holdings: [
      {
        id: 'acc1',
        nickname: 'Chase Checking',
        institution: 'Chase',
        accountType: 'checking',
        country: 'US',
        balanceUsd: 12_345,
        balanceInr: 0,
        isPfic: false,
        source: 'manual',
      },
    ],
    goals: [{ id: 'g1', name: 'Kids College', category: 'education', targetUsd: 200_000, currentUsd: 0, targetYear: 2040 }],
    budget: { incomeUsd: 9000, categories: [] },
    monthlyContribution: 0,
    age: 40,
    indiaDaysCurrentYear: null,
    fbarSnapshots: [],
    demo: false,
    ...over,
  }
}

const post = (body: unknown) =>
  new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

const fabricated = {
  messages: [{ role: 'user', text: 'How much do I have?' }],
  rate: 85,
  holdings: [{ nickname: 'Swiss Vault', country: 'US', balanceUsd: 99_000_000, accountType: 'savings' }],
  goals: [{ name: 'Buy a yacht', targetUsd: 5_000_000 }],
  income: 1_000_000,
}

beforeEach(() => {
  auth.userId = 'user_real'
  stored.ctx = ctx()
  stored.calls = []
  sdk.system = []
  sdk.user = []
  sdk.reply = '{"insights":[]}'
})

describe('/api/copilot grounding', () => {
  it('ignores fabricated holdings, goals and income in the request body', async () => {
    const res = await copilot(post(fabricated))
    expect(res.status).toBe(200)
    const system = sdk.system[0]
    expect(system).toContain('Chase Checking')
    expect(system).toContain('$12,345')
    expect(system).toContain('Kids College')
    expect(system).toContain('$9,000')
    expect(system).not.toContain('Swiss Vault')
    expect(system).not.toContain('yacht')
    expect(system).not.toContain('1,000,000')
    expect(stored.calls[0]).toEqual(['user_real', { demo: false }])
  })

  it('grounds a user with no accounts on "no accounts yet", pointing to Add account', async () => {
    stored.ctx = ctx({ holdings: [], goals: [] })
    await copilot(post(fabricated))
    expect(sdk.system[0]).toContain('No accounts yet')
    expect(sdk.system[0]).toContain('Add account')
    expect(sdk.system[0]).not.toContain('Swiss Vault')
  })

  it('formats figures in the chosen currency (₹ lakhs) but keeps FBAR/FATCA in dollars', async () => {
    await copilot(post({ ...fabricated, mode: 'inr_lakhs', today: '2026-10-06' }))
    const system = sdk.system[0]
    expect(system).toContain('Display currency: Indian rupees, lakh/crore style')
    expect(system).toContain('₹10.49L') // Chase Checking $12,345 × 85
    expect(system).not.toContain('$12,345')
    expect(system).toContain('vs the $10,000 threshold') // FBAR stays in $
    expect(system).toMatch(/Form 8938 total \$0 /) // FATCA stays in $
  })

  it('defaults to dollars for a missing or unknown currency view', async () => {
    await copilot(post({ ...fabricated, mode: 'yen' }))
    expect(sdk.system[0]).toContain('Display currency: US dollars')
    expect(sdk.system[0]).toContain('$12,345')
  })

  it('passes the demo flag through to the loader', async () => {
    await copilot(post({ ...fabricated, demo: true }))
    expect(stored.calls[0]).toEqual(['user_real', { demo: true }])
  })

  it('returns 401 when signed out', async () => {
    auth.userId = null
    expect((await copilot(post(fabricated))).status).toBe(401)
  })
})

describe('FBAR grounding (no invented peak)', () => {
  const india = {
    id: 'nre1',
    nickname: 'HDFC NRE FD',
    institution: 'HDFC',
    accountType: 'nre' as const,
    country: 'IN' as const,
    balanceUsd: 0,
    balanceInr: 87_368 * 83,
    isPfic: false,
    source: 'manual' as const,
  }

  it('with no history this year, the prompt states current balances, never a peak', async () => {
    stored.ctx = ctx({ holdings: [india] })
    await copilot(post({ ...fabricated, rate: 83 }))
    const system = sdk.system[0]
    expect(system).toContain('India accounts total $87,368 at balances as entered')
    expect(system).toContain('true yearly maximum is unknown')
    expect(system).not.toContain('$90,863') // the old current x 1.04 "peak"
    expect(system).not.toMatch(/peaked at/i)
  })

  it('with history, it states the recorded maximum and since when', async () => {
    const year = new Date().getUTCFullYear()
    stored.ctx = ctx({
      holdings: [india],
      fbarSnapshots: [{ accountId: 'nre1', day: `${year}-03-03`, balanceInr: 95_000 * 83 }],
    })
    await copilot(post({ ...fabricated, rate: 83 }))
    expect(sdk.system[0]).toContain('Highest India balances recorded since Mar 3: $95,000 combined')
  })
})

describe('/api/insights grounding', () => {
  it('uses stored holdings, not the body', async () => {
    await insights(post({ rate: 85, holdings: fabricated.holdings }))
    expect(sdk.user[0]).toContain('Chase Checking')
    expect(sdk.user[0]).not.toContain('Swiss Vault')
  })

  it('returns 401 when signed out', async () => {
    auth.userId = null
    expect((await insights(post({}))).status).toBe(401)
  })

  it("replaces the model's FBAR wording with the app's own, so a made-up peak never shows", async () => {
    stored.ctx = ctx({
      holdings: [
        {
          id: 'nre1',
          nickname: 'HDFC NRE FD',
          institution: 'HDFC',
          accountType: 'nre',
          country: 'IN',
          balanceUsd: 0,
          balanceInr: 87_368 * 83,
          isPfic: false,
          source: 'manual',
          lastSyncedAt: '2026-03-03T10:00:00.000Z',
        },
      ],
    })
    sdk.reply = JSON.stringify({
      insights: [
        { key: 'other', title: 'FBAR — FinCEN 114 overdue', detail: 'India accounts peaked at $90,863.', meta: 'Due Apr 15', level: 'overdue' },
        { key: 'pfic', title: 'PFIC', detail: 'Form 8621 per fund.', meta: '', level: 'attention' },
      ],
    })
    const body = await (await insights(post({ rate: 83 }))).json()
    const [fbar, pfic] = body.insights
    expect(fbar.key).toBe('fbar')
    expect(fbar.detail).not.toContain('90,863')
    expect(fbar.detail).toMatch(/^India accounts total \$87,368 at balances last updated Mar 3(, 2026)?, above the \$10,000 threshold/)
    expect(fbar.href).toBe('/accounts?country=IN')
    expect(pfic.detail).toBe('Form 8621 per fund.')
  })

  it('also pins an FBAR item the model titled without "FinCEN"', async () => {
    sdk.reply = JSON.stringify({
      insights: [{ key: 'other', title: 'FBAR filing due', detail: 'Peaked at $1,000,000.', meta: '', level: 'overdue' }],
    })
    const body = await (await insights(post({ rate: 83 }))).json()
    expect(body.insights[0].key).toBe('fbar')
    expect(body.insights[0].detail).not.toContain('1,000,000')
  })
})

describe('resolveRate', async () => {
  const fx = await import('@/lib/fx')
  const { resolveRate } = await import('@/lib/user-context')
  it('keeps a sane client rate; anything else gets the live rate, never a fixed one', async () => {
    const live = vi.spyOn(fx, 'getFxSnapshot').mockResolvedValue({ rate: 95.2, updatedAt: null, source: 'cached' })
    expect(await resolveRate(84.2)).toBe(84.2)
    expect(live).not.toHaveBeenCalled()
    for (const bad of [10, 500, 'abc', undefined, null, '']) expect(await resolveRate(bad)).toBe(95.2)
    live.mockRestore()
  })
})
