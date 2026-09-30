import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UnauthorizedError } from '@/lib/auth'

/**
 * Route-level tests: every branch of POST is exercised by mocking its three
 * collaborators (auth, the Anthropic client, and @/lib/cas-import) rather than
 * feeding it real PDF/Word/Excel bytes — cas-import.test.ts already covers the
 * real parsing/validation logic in isolation. This file only verifies the
 * route's own orchestration: which status/error each failure mode produces,
 * and that a genuine success passes proposals straight through.
 */

const { mockRequireUserId } = vi.hoisted(() => ({ mockRequireUserId: vi.fn() }))
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return { ...actual, requireUserId: mockRequireUserId }
})

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

const { mockValidateCasFile, mockBuildExtractionContent, mockParseExtractionResult } = vi.hoisted(() => ({
  mockValidateCasFile: vi.fn(),
  mockBuildExtractionContent: vi.fn(),
  mockParseExtractionResult: vi.fn(),
}))
vi.mock('@/lib/cas-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cas-import')>()
  return {
    ...actual,
    validateCasFile: mockValidateCasFile,
    buildExtractionContent: mockBuildExtractionContent,
    parseExtractionResult: mockParseExtractionResult,
  }
})

const { POST } = await import('./route')

function requestWithFile(file: File | null): Request {
  const form = new FormData()
  if (file) form.set('file', file)
  return new Request('http://localhost/api/accounts/import-cas', { method: 'POST', body: form })
}

const fakePdf = () => new File([new Uint8Array([1, 2, 3])], 'CAS.pdf', { type: 'application/pdf' })

beforeEach(() => {
  mockRequireUserId.mockReset().mockResolvedValue('user_123')
  mockCreate.mockReset()
  mockValidateCasFile.mockReset()
  mockBuildExtractionContent.mockReset()
  mockParseExtractionResult.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/accounts/import-cas', () => {
  it('returns 401 when the user is unauthenticated', async () => {
    mockRequireUserId.mockRejectedValue(new UnauthorizedError())
    const res = await POST(requestWithFile(fakePdf()))
    expect(res.status).toBe(401)
    expect(mockValidateCasFile).not.toHaveBeenCalled()
  })

  it('returns 400 when no file is attached', async () => {
    const res = await POST(requestWithFile(null))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no file/i)
  })

  it('returns 400 when the request body cannot be read as form data', async () => {
    const badRequest = { formData: () => Promise.reject(new Error('boom')) } as unknown as Request
    const res = await POST(badRequest)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/could not read/i)
  })

  it('returns 400 with the validation error and short-circuits before extraction', async () => {
    mockValidateCasFile.mockReturnValue({ ok: false, error: 'Unsupported file — upload a PDF, Word, or Excel statement.' })
    const res = await POST(requestWithFile(fakePdf()))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Unsupported file — upload a PDF, Word, or Excel statement.')
    expect(mockBuildExtractionContent).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns 422 when content extraction throws (corrupt/unreadable file)', async () => {
    mockValidateCasFile.mockReturnValue({ ok: true, ext: '.docx' })
    mockBuildExtractionContent.mockRejectedValue(new Error('mammoth blew up on this docx'))
    const res = await POST(requestWithFile(fakePdf()))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/couldn.t read that statement/i)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('passes the validated extension and the file bytes through to extraction', async () => {
    mockValidateCasFile.mockReturnValue({ ok: true, ext: '.xlsx' })
    mockBuildExtractionContent.mockResolvedValue([{ type: 'text', text: 'stub' }])
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'no tool use' }] })

    const bytes = new Uint8Array([9, 8, 7, 6])
    await POST(requestWithFile(new File([bytes], 'holdings.xlsx')))

    expect(mockBuildExtractionContent).toHaveBeenCalledTimes(1)
    const [ext, buffer] = mockBuildExtractionContent.mock.calls[0]
    expect(ext).toBe('.xlsx')
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(Uint8Array.from(buffer as Buffer)).toEqual(bytes)
  })

  it('returns 502 when the Claude call itself fails', async () => {
    mockValidateCasFile.mockReturnValue({ ok: true, ext: '.pdf' })
    mockBuildExtractionContent.mockResolvedValue([{ type: 'text', text: 'stub' }])
    mockCreate.mockRejectedValue(new Error('network blip'))

    const res = await POST(requestWithFile(fakePdf()))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatch(/couldn.t be parsed right now/i)
  })

  it('returns 422 when the model reply has no tool_use block', async () => {
    mockValidateCasFile.mockReturnValue({ ok: true, ext: '.pdf' })
    mockBuildExtractionContent.mockResolvedValue([{ type: 'text', text: 'stub' }])
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I could not use the tool' }] })

    const res = await POST(requestWithFile(fakePdf()))
    expect(res.status).toBe(422)
    expect(mockParseExtractionResult).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.error).toMatch(/no mutual fund holdings/i)
  })

  it('returns 422 when extraction succeeds but yields zero holdings', async () => {
    mockValidateCasFile.mockReturnValue({ ok: true, ext: '.pdf' })
    mockBuildExtractionContent.mockResolvedValue([{ type: 'text', text: 'stub' }])
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', id: 't1', name: 'report_holdings', input: { holdings: [] } }] })
    mockParseExtractionResult.mockReturnValue({ proposals: [], skipped: 3 })

    const res = await POST(requestWithFile(fakePdf()))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/no mutual fund holdings/i)
  })

  it('returns 200 with the parsed proposals on a genuine success', async () => {
    mockValidateCasFile.mockReturnValue({ ok: true, ext: '.pdf' })
    mockBuildExtractionContent.mockResolvedValue([{ type: 'text', text: 'stub' }])
    const toolInput = { holdings: [{ schemeName: 'HDFC Flexi Cap Fund', marketValueInr: 250000 }] }
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', id: 't1', name: 'report_holdings', input: toolInput }] })
    const fakeProposals = [{ summary: 'Import HDFC Flexi Cap Fund — ₹250,000', account: { nickname: 'HDFC Flexi Cap Fund' } }]
    mockParseExtractionResult.mockReturnValue({ proposals: fakeProposals, skipped: 0 })

    const res = await POST(requestWithFile(fakePdf()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.proposals).toEqual(fakeProposals)
    expect(mockParseExtractionResult).toHaveBeenCalledWith(toolInput)
  })
})
