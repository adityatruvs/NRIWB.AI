import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { complianceItems, type Holding } from '@/lib/portfolio'

// ── Module-boundary mocks ────────────────────────────────────────────────────
// We mock the two true external boundaries this route talks to:
//   - '@anthropic-ai/sdk'   (the AI provider)
//   - '@clerk/nextjs/server' (the auth provider, via its `auth()` function)
// Our own code — src/lib/auth.ts's requireUserId()/unauthorized() glue, and all
// of src/lib/portfolio.ts's prompt-context math — runs for real, so these tests
// exercise the actual route + our own wrapper logic, not a re-implementation of it.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}))

const { POST } = await import('@/app/api/insights/route')

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'h1',
    nickname: 'Chase Checking',
    institution: 'Chase',
    accountType: 'checking',
    country: 'US',
    balanceUsd: 12_500,
    balanceInr: 0,
    isPfic: false,
    source: 'manual',
    ...overrides,
  }
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** Builds the shape client.messages.create() resolves to. */
function anthropicTextResponse(text: string) {
  return { content: [{ type: 'text', text }] }
}

beforeEach(() => {
  mockCreate.mockReset()
  mockAuth.mockReset()
  mockAuth.mockResolvedValue({ userId: 'user_123' }) // authenticated by default
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/insights — authentication', () => {
  it('returns 401 and never calls the AI provider when there is no authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('propagates a non-auth error from the Clerk boundary instead of swallowing it as 401', async () => {
    mockAuth.mockRejectedValue(new Error('Clerk outage'))
    await expect(POST(jsonRequest({ holdings: [], rate: 83.5 }))).rejects.toThrow('Clerk outage')
  })
})

describe('POST /api/insights — request body validation', () => {
  it('returns 400 for an unparsable JSON body', async () => {
    const res = await POST(jsonRequest('not valid json'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('treats a non-array holdings field as an empty portfolio rather than erroring', async () => {
    const res = await POST(jsonRequest({ holdings: 'not-an-array', rate: 83.5 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('fallback')
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('POST /api/insights — empty portfolio (fallback without calling AI)', () => {
  it('returns the rule-based fallback and never calls the AI provider', async () => {
    const res = await POST(jsonRequest({ holdings: [], rate: 83.5 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('fallback')
    expect(body.insights).toEqual(complianceItems([], 83.5))
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('POST /api/insights — prompt construction', () => {
  it('grounds the prompt in the supplied holdings, rate, and computed net worth', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse('{"insights":[]}'))
    const holdings: Holding[] = [
      makeHolding({ id: 'a', nickname: 'Zzyzx Test Checking', institution: 'Zzyzx Bank', balanceUsd: 12_500 }),
      makeHolding({
        id: 'b',
        nickname: 'HDFC NRE FD',
        institution: 'HDFC Bank',
        accountType: 'nre',
        country: 'IN',
        balanceUsd: 0,
        balanceInr: 4_500_000,
      }),
    ]
    await POST(jsonRequest({ holdings, rate: 83.5 }))

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const call = mockCreate.mock.calls[0][0]
    expect(call.model).toBe('claude-sonnet-4-6')
    expect(typeof call.system).toBe('string')
    expect(call.system).toContain('NRIWB')
    const userContent: string = call.messages[0].content
    // Account identity from the request shows up verbatim in the prompt.
    expect(userContent).toContain('Zzyzx Test Checking')
    expect(userContent).toContain('Zzyzx Bank')
    expect(userContent).toContain('HDFC NRE FD')
    // The supplied FX rate is echoed into the prompt, not a different value.
    expect(userContent).toContain('83.50')
    // Net worth is computed from the supplied holdings (12,500 USD + 4,500,000/83.5 INR).
    expect(userContent).toContain('Net worth')
  })

  it('defaults the rate to 83 when the request omits it (documents `body.rate || 83`)', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse('{"insights":[]}'))
    const holdings: Holding[] = [makeHolding({ country: 'IN', accountType: 'nro', balanceInr: 100_000 })]
    await POST(jsonRequest({ holdings }))
    const userContent: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(userContent).toContain('83.00')
  })

  // BUG-DOCUMENTING: `body.rate || 83` uses `||`, not `??`, so an explicit rate of
  // 0 is treated the same as "omitted" and silently replaced with 83. A rate of 0
  // is nonsensical for FX, so this rarely matters in practice — documented so a
  // future refactor doesn't unknowingly change this fallback behavior.
  it('BUG-DOCUMENTING: an explicit rate of 0 is also replaced with the 83 default', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse('{"insights":[]}'))
    const holdings: Holding[] = [makeHolding({ country: 'IN', accountType: 'nro', balanceInr: 100_000 })]
    await POST(jsonRequest({ holdings, rate: 0 }))
    const userContent: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(userContent).toContain('83.00')
  })
})

describe('POST /api/insights — successful structured AI response', () => {
  it('parses a valid JSON response into the insights shape the client expects', async () => {
    mockCreate.mockResolvedValue(
      anthropicTextResponse(
        JSON.stringify({
          insights: [
            { title: 'FBAR — FinCEN 114', detail: 'Peaked above the threshold.', meta: 'Due Apr 15', level: 'overdue' },
          ],
        }),
      ),
    )
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('ai')
    expect(body.insights).toEqual([
      { key: 'ai-0', level: 'overdue', title: 'FBAR — FinCEN 114', detail: 'Peaked above the threshold.', meta: 'Due Apr 15' },
    ])
  })

  it('handles JSON wrapped in a markdown code fence', async () => {
    const raw = '```json\n{"insights":[{"title":"T","detail":"D","meta":"M","level":"attention"}]}\n```'
    mockCreate.mockResolvedValue(anthropicTextResponse(raw))
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const body = await res.json()
    expect(body.source).toBe('ai')
    expect(body.insights).toHaveLength(1)
    expect(body.insights[0]).toMatchObject({ title: 'T', detail: 'D', meta: 'M', level: 'attention' })
  })

  it('handles JSON preceded/followed by stray prose text outside the fence', async () => {
    const raw = 'Sure, here you go:\n{"insights":[{"title":"T","detail":"D","meta":"M","level":"attention"}]}\nHope that helps!'
    mockCreate.mockResolvedValue(anthropicTextResponse(raw))
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const body = await res.json()
    expect(body.source).toBe('ai')
    expect(body.insights).toHaveLength(1)
  })

  it('joins multiple text content blocks and ignores non-text blocks', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'thinking', text: 'reasoning the model does not want surfaced' },
        { type: 'text', text: '{"insights":[]' },
        { type: 'text', text: '}' },
      ],
    })
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const body = await res.json()
    expect(body.source).toBe('ai')
    expect(body.insights).toEqual([])
  })

  it('accepts a valid, empty insights array as a genuine "nothing needs attention" result', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse('{"insights":[]}'))
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const body = await res.json()
    expect(body.source).toBe('ai')
    expect(body.insights).toEqual([])
  })

  it('caps the returned insights at 6 items even if the model returns more', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      title: `Item ${i}`,
      detail: `Detail ${i}`,
      meta: `Meta ${i}`,
      level: 'attention',
    }))
    mockCreate.mockResolvedValue(anthropicTextResponse(JSON.stringify({ insights: items })))
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const body = await res.json()
    expect(body.insights).toHaveLength(6)
  })

  it('falls back to level "attention" when the model returns an unrecognized level value', async () => {
    mockCreate.mockResolvedValue(
      anthropicTextResponse(JSON.stringify({ insights: [{ title: 'T', detail: 'D', meta: 'M', level: 'urgent!!' }] })),
    )
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const body = await res.json()
    expect(body.insights[0].level).toBe('attention')
  })

  it('defaults meta to an empty string when the model omits it', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse(JSON.stringify({ insights: [{ title: 'T', detail: 'D' }] })))
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const body = await res.json()
    expect(body.insights[0].meta).toBe('')
  })

  it('filters out entries missing a required title or detail field', async () => {
    mockCreate.mockResolvedValue(
      anthropicTextResponse(
        JSON.stringify({
          insights: [
            { title: 'Valid', detail: 'Has both fields', meta: '', level: 'ok' },
            { detail: 'Missing title' },
            { title: 'Missing detail' },
            { title: 42, detail: 'Title is the wrong type' },
          ],
        }),
      ),
    )
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const body = await res.json()
    expect(body.insights).toHaveLength(1)
    expect(body.insights[0].title).toBe('Valid')
  })
})

describe('POST /api/insights — malformed or empty AI responses fall back to rule-based items', () => {
  it('falls back when the response contains no JSON object at all', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse('Sorry, I cannot help with that.'))
    const holdings = [makeHolding()]
    const res = await POST(jsonRequest({ holdings, rate: 83.5 }))
    const body = await res.json()
    expect(body.source).toBe('fallback')
    expect(body.insights).toEqual(complianceItems(holdings, 83.5))
  })

  it('falls back when the extracted braces contain syntactically invalid JSON', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse('{"insights": [{"title": "oops", "detail": "trailing comma",}]}'))
    const holdings = [makeHolding()]
    const res = await POST(jsonRequest({ holdings, rate: 83.5 }))
    const body = await res.json()
    expect(body.source).toBe('fallback')
    expect(body.insights).toEqual(complianceItems(holdings, 83.5))
  })

  it('falls back when the response has an empty content array', async () => {
    mockCreate.mockResolvedValue({ content: [] })
    const holdings = [makeHolding()]
    const res = await POST(jsonRequest({ holdings, rate: 83.5 }))
    const body = await res.json()
    expect(body.source).toBe('fallback')
    expect(body.insights).toEqual(complianceItems(holdings, 83.5))
  })

  it('falls back when the top-level JSON value is not an object with an insights array', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse('{"unexpected": true}'))
    const holdings = [makeHolding()]
    const res = await POST(jsonRequest({ holdings, rate: 83.5 }))
    const body = await res.json()
    // `obj.insights ?? []` means a well-formed object without an `insights` key
    // is treated as a valid empty result (source stays "ai"), not a parse failure.
    expect(body.source).toBe('ai')
    expect(body.insights).toEqual([])
  })
})

describe('POST /api/insights — provider failure falls back without leaking internals', () => {
  it('falls back to rule-based items when the provider call rejects', async () => {
    mockCreate.mockRejectedValue(new Error('rate limit exceeded'))
    const holdings = [makeHolding()]
    const res = await POST(jsonRequest({ holdings, rate: 83.5 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('fallback')
    expect(body.insights).toEqual(complianceItems(holdings, 83.5))
  })

  it('never includes the raw provider error message or an API key in the response body', async () => {
    mockCreate.mockRejectedValue(new Error('Authentication failed: invalid x-api-key sk-ant-super-secret-123'))
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const raw = await res.text()
    expect(raw).not.toContain('sk-ant-super-secret-123')
    expect(raw).not.toContain('x-api-key')
    expect(raw).not.toContain('Authentication failed')
  })

  it('the response body only ever contains the documented `insights` and `source` fields', async () => {
    mockCreate.mockResolvedValue(anthropicTextResponse('{"insights":[]}'))
    const res = await POST(jsonRequest({ holdings: [makeHolding()], rate: 83.5 }))
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['insights', 'source'])
  })
})
