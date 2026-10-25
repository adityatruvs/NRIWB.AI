// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftLine } from '@/lib/quick-entry'

vi.mock('@/context/CurrencyContext', () => ({ useCurrency: () => ({ mode: 'usd', rate: 90 }) }))

// Whole-screen renders; under the full parallel suite they can be slow on a busy machine.
vi.setConfig({ testTimeout: 30_000 })

const { QuickEntry } = await import('./QuickEntry')

const parsed: DraftLine[] = [
  {
    id: 'srv-1',
    country: 'IN',
    kind: 'asset',
    type: null,
    name: 'HDFC savings',
    institution: 'HDFC',
    amount: null,
    currency: 'INR',
    hint: 'savings',
  },
]

const tellStep = () => screen.getByRole('button', { name: /^1\s*Tell us/ })
const listStep = () => screen.getByRole('button', { name: /^2\s*Your list/ })

function mount() {
  return render(
    <QuickEntry rate={90} onSave={async (l) => l} onDone={() => {}} onMoreWays={() => {}} onDirtyChange={() => {}} />,
  )
}

beforeEach(() => {
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ lines: parsed }), { status: 200 })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Quick entry: checklist (161, 162)', () => {
  it('opens on an empty list with tiles in all four groups, forgotten ones flagged', () => {
    mount()
    for (const g of ['India assets', 'US assets', 'India liabilities', 'US liabilities']) {
      expect(screen.getByRole('heading', { name: new RegExp(g) })).toBeTruthy()
    }
    expect(screen.getAllByText('Often forgotten').length).toBeGreaterThan(0)
  })

  it('a tile adds a line of that type, focuses its amount, and the tile shows the count', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /^Add Home loan to India liabilities$/i }))
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Amount owed'))
    fireEvent.click(screen.getByRole('button', { name: /Add Home loan to India liabilities \(1 already\)/i }))
    expect(screen.getByRole('button', { name: /\(2 already\)/ })).toBeTruthy()
  })

  it('"Skip and pick from a checklist" on Tell us opens the empty list with the tiles', () => {
    mount()
    fireEvent.click(tellStep())
    fireEvent.click(screen.getByRole('button', { name: 'Skip and pick from a checklist' }))
    expect(screen.queryByLabelText('Your accounts')).toBeNull()
    expect(screen.getByRole('heading', { name: /What do you have/ })).toBeTruthy()
  })
})

describe('Quick entry: moving between steps (159)', () => {
  it('keeps typed text and fixed lines when going back and forth, and adds new text to the list', async () => {
    mount()
    fireEvent.click(tellStep())
    fireEvent.change(screen.getByLabelText('Describe your accounts'), { target: { value: 'two at HDFC' } })
    fireEvent.click(screen.getByRole('button', { name: 'List my accounts' }))
    await screen.findByDisplayValue('HDFC savings')

    const amount = screen.getByLabelText('Balance')
    fireEvent.change(amount, { target: { value: '40L' } })
    fireEvent.blur(amount)
    expect((amount as HTMLInputElement).value, 'after blur').toBe('40,00,000')
    fireEvent.click(tellStep())
    fireEvent.change(screen.getByLabelText('Describe your accounts'), { target: { value: 'half typed' } })
    fireEvent.click(listStep())
    expect((screen.getByLabelText('Balance') as HTMLInputElement).value).toBe('40,00,000')
    fireEvent.click(tellStep())
    expect((screen.getByLabelText('Describe your accounts') as HTMLTextAreaElement).value).toBe('half typed')

    fireEvent.click(screen.getByRole('button', { name: 'Add to my list' }))
    await waitFor(() => expect(screen.getAllByDisplayValue('HDFC savings')).toHaveLength(2))
    expect((screen.getAllByLabelText('Balance')[0] as HTMLInputElement).value).toBe('40,00,000')
  })

  it('lets you step to the list while the AI is still answering, and the lines land when it does', async () => {
    let finish: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => (finish = res))))
    mount()
    fireEvent.click(tellStep())
    fireEvent.change(screen.getByLabelText('Describe your accounts'), { target: { value: 'HDFC' } })
    fireEvent.click(screen.getByRole('button', { name: /List my accounts|Listing/ }))
    fireEvent.click(listStep())
    await act(async () => finish(new Response(JSON.stringify({ lines: parsed }), { status: 200 })))
    expect(await screen.findByDisplayValue('HDFC savings')).toBeTruthy()
  })

  it('a failed AI call keeps what was typed when moving between steps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'nope' }), { status: 502 })))
    mount()
    fireEvent.click(tellStep())
    fireEvent.change(screen.getByLabelText('Describe your accounts'), { target: { value: 'HDFC' } })
    fireEvent.click(screen.getByRole('button', { name: 'List my accounts' }))
    expect(await screen.findByText('nope')).toBeTruthy()
    fireEvent.click(listStep())
    fireEvent.click(tellStep())
    expect((screen.getByLabelText('Describe your accounts') as HTMLTextAreaElement).value).toBe('HDFC')
  })

  it('an empty submit shows a message and does not call the AI', () => {
    mount()
    fireEvent.click(tellStep())
    fireEvent.click(screen.getByRole('button', { name: 'List my accounts' }))
    expect(screen.getByText(/Tell us at least one account/)).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('removing a tile-added line and undoing puts it back with its count', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Add Property to India assets' }))
    fireEvent.click(screen.getByRole('button', { name: /^Remove/ }))
    expect(screen.queryByLabelText('Your accounts')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: /Add Property to India assets \(1 already\)/ })).toBeTruthy()
  })

  it('marks the current step and shows the line count on the list step', () => {
    mount()
    expect(listStep().getAttribute('aria-current')).toBe('step')
    fireEvent.click(screen.getByRole('button', { name: 'Add Property to India assets' }))
    expect(screen.getByRole('button', { name: /Your list \(1\)/ })).toBeTruthy()
  })
})

describe('Quick entry: voice (160)', () => {
  type Fake = {
    lang: string
    onresult?: (e: unknown) => void
    onerror?: (e: { error: string }) => void
    onend?: () => void
    abort: ReturnType<typeof vi.fn>
  }
  let inst: Fake | null = null

  function installSpeech() {
    class Recognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult?: Fake['onresult']
      onerror?: Fake['onerror']
      onend?: Fake['onend']
      start = vi.fn()
      stop = vi.fn(() => this.onend?.())
      abort = vi.fn(() => this.onend?.())
      constructor() {
        inst = this as unknown as Fake
      }
    }
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = Recognition
  }
  afterEach(() => {
    inst = null
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  })
  const said = (t: string) => ({ results: [[{ transcript: t }]] })

  it('writes what is heard into the box in Indian English; typing then ends the dictation', () => {
    installSpeech()
    mount()
    fireEvent.click(tellStep())
    fireEvent.click(screen.getByRole('button', { name: /Speak/ }))
    expect(inst?.lang).toBe('en-IN')
    act(() => inst?.onresult?.(said('NRE savings at ICICI')))
    const box = screen.getByLabelText('Describe your accounts') as HTMLTextAreaElement
    expect(box.value).toBe('NRE savings at ICICI')

    fireEvent.change(box, { target: { value: 'NRE savings at ICICI 10L' } })
    expect(inst?.abort).toHaveBeenCalled()
    act(() => inst?.onresult?.(said('late words')))
    expect(box.value).toBe('NRE savings at ICICI 10L')
  })

  it('typing before anything is heard also ends the dictation, and Speak works again right away', () => {
    installSpeech()
    mount()
    fireEvent.click(tellStep())
    fireEvent.click(screen.getByRole('button', { name: /Speak/ }))
    const first = inst
    const box = screen.getByLabelText('Describe your accounts') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'typed first' } })
    expect(first?.abort).toHaveBeenCalled()
    act(() => first?.onresult?.(said('ignored')))
    expect(box.value).toBe('typed first')

    fireEvent.click(screen.getByRole('button', { name: /Speak/ }))
    expect(inst).not.toBe(first)
    act(() => inst?.onresult?.(said('and spoken')))
    expect(box.value).toBe('typed first and spoken')
  })

  it('leaving the Tell us step while listening stops the microphone and keeps the text', () => {
    installSpeech()
    mount()
    fireEvent.click(tellStep())
    fireEvent.click(screen.getByRole('button', { name: /Speak/ }))
    act(() => inst?.onresult?.(said('HDFC savings')))
    const rec = inst
    fireEvent.click(listStep())
    expect(rec?.abort).toHaveBeenCalled()
    act(() => rec?.onresult?.(said('late')))
    fireEvent.click(tellStep())
    expect((screen.getByLabelText('Describe your accounts') as HTMLTextAreaElement).value).toBe('HDFC savings')
  })

  it('other problems get their own plain message, and a deliberate stop shows none', () => {
    installSpeech()
    mount()
    fireEvent.click(tellStep())
    fireEvent.click(screen.getByRole('button', { name: /Speak/ }))
    act(() => inst?.onerror?.({ error: 'audio-capture' }))
    expect(screen.getByText(/couldn.t find a microphone/)).toBeTruthy()
    act(() => inst?.onerror?.({ error: 'network' }))
    expect(screen.getByText(/needs an internet connection/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Listening/ }))
    expect(screen.queryByRole('button', { name: /Listening/ })).toBeNull()
  })

  it('explains how to type instead when the microphone is blocked', () => {
    installSpeech()
    mount()
    fireEvent.click(tellStep())
    fireEvent.click(screen.getByRole('button', { name: /Speak/ }))
    act(() => inst?.onerror?.({ error: 'not-allowed' }))
    expect(screen.getByText(/Microphone access is blocked.*type instead/)).toBeTruthy()
  })

  it('says so, instead of hiding, in a browser without speech recognition', () => {
    mount()
    fireEvent.click(tellStep())
    fireEvent.click(screen.getByRole('button', { name: /Speak/ }))
    expect(screen.getByText(/Voice typing isn.t available in this browser/)).toBeTruthy()
  })
})
