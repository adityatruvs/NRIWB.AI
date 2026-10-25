// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/context/CurrencyContext', () => ({ useCurrency: () => ({ mode: 'usd', rate: 100 }) }))

const { QuickEntry } = await import('./QuickEntry')

type Line = Record<string, unknown>
const line = (id: string, o: Line): Line => ({ id, institution: '', kind: 'asset', currency: 'USD', amount: null, type: null, ...o })

// One of everything, deliberately out of order, to prove the screen sorts it into the four groups.
const LINES = [
  line('us-mort', { name: 'Chase Mortgage', country: 'US', kind: 'liability', type: 'mortgage', amount: 200000 }),
  line('in-sav', { name: 'HDFC savings', country: 'IN', currency: 'INR', hint: 'savings' }),
  line('us-chk', { name: 'Chase checking', country: 'US', type: 'checking', amount: 5000 }),
  line('in-fd', { name: 'Axis FD', country: 'IN', currency: 'INR', hint: 'fd', amount: 500000 }),
  line('in-loan', { name: 'HDFC home loan', country: 'IN', kind: 'liability', currency: 'INR', type: 'home_loan', amount: 8000000 }),
  line('where', { name: 'Mystery account', country: null }),
]

/** Describe → List my accounts, with the AI stubbed to return `lines`; resolves once the review is up. */
function reviewScreen(lines = LINES, onSave: (h: unknown[]) => Promise<unknown[]> = async (h) => h, onDone = vi.fn()) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ lines }) }))
  render(
    <QuickEntry rate={100} onSave={onSave as never} onDone={onDone} onMoreWays={() => {}} onDirtyChange={() => {}} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Describe them with AI' }))
  fireEvent.change(screen.getByLabelText('Describe your accounts'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'List my accounts' }))
  return screen.findByRole('heading', { name: 'Here’s what we heard' })
}

const rowOf = (name: string) => screen.getByRole('button', { name: `Remove ${name}` }).closest('[data-line]') as HTMLElement
const names = () => screen.getAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label')!.replace('Remove ', ''))
const list = () => within(screen.getByRole('region', { name: 'Your accounts' }))
// The label also appears as an <option> in each "Where is this?" dropdown; the header is the other match.
const headerOf = (label: string) => list().getAllByText(label).find((e) => e.tagName !== 'OPTION')!
const groupHeader = headerOf

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('review: grouped on one screen with totals', () => {
  it('groups India assets, US assets, India liabilities, US liabilities, in that order', async () => {
    await reviewScreen()
    const headers = ['India assets', 'US assets', 'India liabilities', 'US liabilities'].map((t) => headerOf(t))
    for (let i = 1; i < headers.length; i++)
      expect(headers[i - 1].compareDocumentPosition(headers[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(names()).toEqual(['Mystery account', 'HDFC savings', 'Axis FD', 'Chase checking', 'HDFC home loan', 'Chase Mortgage'])
  })

  it('shows a count and a total per group, liabilities negative', async () => {
    await reviewScreen()
    expect(groupHeader('India assets')).toHaveTextContent('2 accounts')
    expect(groupHeader('India assets')).toHaveTextContent('₹5.00L')
    expect(groupHeader('US assets')).toHaveTextContent('1 account')
    expect(groupHeader('US assets')).toHaveTextContent('$5,000')
    expect(groupHeader('India liabilities')).toHaveTextContent('−₹80.00L')
    expect(groupHeader('US liabilities')).toHaveTextContent('−$200,000')
  })

  it('a total follows an edited amount', async () => {
    await reviewScreen()
    const box = within(rowOf('Chase checking')).getByLabelText('Balance', { exact: true })
    fireEvent.change(box, { target: { value: '7k' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(groupHeader('US assets')).toHaveTextContent('$7,000'))
  })
})

describe('review: edit name, type and amount; missing ones are highlighted', () => {
  it('name, type and amount are all editable on a line', async () => {
    await reviewScreen()
    const row = within(rowOf('Chase checking'))
    fireEvent.change(row.getByDisplayValue('Chase checking'), { target: { value: 'Chase Total Checking' } })
    expect(screen.getByDisplayValue('Chase Total Checking')).toBeInTheDocument()
    fireEvent.change(row.getByLabelText('Account type'), { target: { value: 'savings' } })
    expect((row.getByLabelText('Account type') as HTMLSelectElement).value).toBe('savings')
    const amt = row.getByLabelText('Balance', { exact: true })
    fireEvent.change(amt, { target: { value: '1.5M' } })
    fireEvent.keyDown(amt, { key: 'Enter' })
    expect((amt as HTMLInputElement).value).toBe('1,500,000')
  })

  it('a missing type and a missing amount are tinted and counted; filled ones are not', async () => {
    await reviewScreen()
    const sav = within(rowOf('HDFC savings'))
    expect(sav.getByLabelText('Account type').className).toContain('border-saffron')
    expect(sav.getByLabelText('Balance', { exact: true }).className).toContain('border-saffron')
    const chk = within(rowOf('Chase checking'))
    expect(chk.getByLabelText('Account type').className).not.toContain('border-saffron')
    expect(chk.getByLabelText('Balance', { exact: true }).className).not.toContain('border-saffron')
    expect(screen.getByText('3 need a type')).toBeInTheDocument() // savings, FD, mystery
    expect(screen.getByText('2 need an amount')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled()
  })

  it('an amount that cannot be read is refused with a message, not silently dropped', async () => {
    await reviewScreen()
    const amt = within(rowOf('Chase checking')).getByLabelText('Balance', { exact: true })
    fireEvent.change(amt, { target: { value: '12 apples' } })
    fireEvent.keyDown(amt, { key: 'Enter' })
    expect(screen.getByRole('alert')).toHaveTextContent('Use numbers')
    // An unreadable amount counts as no amount, so a stale $5,000 can't be saved behind it.
    expect(groupHeader('US assets')).not.toHaveTextContent('$5,000')
    expect(screen.getByText('3 need an amount')).toBeInTheDocument()
  })

  it('"Not sure where" lines ask for India or US, then move into place', async () => {
    await reviewScreen()
    const where = within(rowOf('Mystery account')).getByLabelText('Where is this account')
    fireEvent.change(where, { target: { value: 'US:asset' } })
    expect(screen.queryByText('Not sure where these go')).not.toBeInTheDocument()
    expect(groupHeader('US assets')).toHaveTextContent('2 accounts')
  })
})

describe('review: one-tap NRE / NRO', () => {
  it('an India savings line without a type offers NRE Savings / NRO Savings; one tap sets it', async () => {
    await reviewScreen()
    const row = within(rowOf('HDFC savings'))
    expect(row.getByRole('button', { name: 'NRE Savings' })).toBeInTheDocument()
    fireEvent.click(row.getByRole('button', { name: 'NRO Savings' }))
    expect((row.getByLabelText('Account type') as HTMLSelectElement).value).toBe('nro')
    expect(row.queryByRole('button', { name: 'NRE Savings' })).not.toBeInTheDocument()
  })

  it('an India FD without a type offers the NRE / NRO fixed deposit pair', async () => {
    await reviewScreen()
    const row = within(rowOf('Axis FD'))
    const offered = row.getAllByRole('button').filter((b) => /NR[EO]/.test(b.textContent ?? ''))
    expect(offered).toHaveLength(2)
    fireEvent.click(offered[0])
    expect((row.getByLabelText('Account type') as HTMLSelectElement).value).toBe('fd_nre')
  })

  it('is not offered on a US line, a typed line or an India loan', async () => {
    await reviewScreen()
    for (const n of ['Chase checking', 'HDFC home loan', 'Chase Mortgage'])
      expect(within(rowOf(n)).queryByRole('button', { name: /^NR[EO]/ })).not.toBeInTheDocument()
  })
})

describe('review: remove with Undo', () => {
  it('removes a line, then Undo puts it back in the same place', async () => {
    await reviewScreen()
    const before = names()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Chase checking' }))
    expect(names()).not.toContain('Chase checking')
    expect(screen.getByRole('status')).toHaveTextContent('Removed Chase checking.')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(names()).toEqual(before)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('two quick removals can both be undone, newest first', async () => {
    await reviewScreen()
    const before = names()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Chase checking' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Axis FD' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(names()).toContain('Axis FD')
    expect(names()).not.toContain('Chase checking')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(names()).toEqual(before)
  })

  it('the Undo offer expires after a few seconds', async () => {
    await reviewScreen()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Chase checking' }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(6100)
    })
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('removing every line leaves a usable screen with nothing to save', async () => {
    await reviewScreen()
    for (const n of names()) fireEvent.click(screen.getByRole('button', { name: `Remove ${n}` }))
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
    expect(screen.getByText('What do you have?')).toBeInTheDocument()
  })
})

// A complete list: nothing missing, so Save is allowed.
const COMPLETE = [
  line('a', { name: 'Chase checking', country: 'US', type: 'checking', amount: 5000 }),
  line('b', { name: 'HDFC NRE', country: 'IN', currency: 'INR', type: 'nre', amount: 4000000 }),
  line('c', { name: 'Home loan', country: 'IN', kind: 'liability', currency: 'INR', type: 'home_loan', amount: 8000000 }),
]
const saveButton = () => screen.getByRole('button', { name: /^Save/ })

describe('save: nothing is saved until every line has a type and an amount', () => {
  it('stays off and says what is missing, on the button as well as beside it', async () => {
    const onSave = vi.fn(async (h: unknown[]) => h)
    await reviewScreen(LINES, onSave)
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('3 need a type')).toBeInTheDocument()
    expect(screen.getByText('2 need an amount')).toBeInTheDocument()
    expect(saveButton()).toHaveAttribute('title', 'Not yet: 3 need a type · 2 need an amount')
    fireEvent.click(saveButton())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('says "1 needs a type" in the singular', async () => {
    await reviewScreen([line('a', { name: 'HDFC', country: 'IN', currency: 'INR', amount: 100000 })])
    expect(screen.getByText('1 needs a type')).toBeInTheDocument()
  })

  it('turns on only when the last gap is filled', async () => {
    await reviewScreen([...COMPLETE, line('d', { name: 'Ally', country: 'US', type: 'savings' })])
    expect(saveButton()).toBeDisabled()
    const amt = within(rowOf('Ally')).getByLabelText('Balance', { exact: true })
    fireEvent.change(amt, { target: { value: '20k' } })
    fireEvent.keyDown(amt, { key: 'Enter' })
    expect(saveButton()).toBeEnabled()
    expect(saveButton()).toHaveTextContent('Save 4 accounts')
  })

  it('saves each account once, even if Save is hit again while it is saving', async () => {
    let finish!: (v: unknown[]) => void
    type Sent = { nickname: string; accountType: string; country: string }
    const onSave = vi.fn((_: Sent[]) => new Promise<unknown[]>((r) => (finish = r)))
    const onDone = vi.fn()
    await reviewScreen(COMPLETE, onSave as never, onDone)
    const btn = saveButton() // its label turns to "Saving…", so hold on to the element
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(btn).toBeDisabled()
    expect(onSave).toHaveBeenCalledTimes(1)
    const sent = onSave.mock.calls[0][0]
    expect(sent.map((h) => h.nickname)).toEqual(['Chase checking', 'HDFC NRE', 'Home loan'])
    expect(sent.map((h) => h.accountType)).toEqual(['checking', 'nre', 'home_loan'])
    await act(async () => finish(sent.map((h, i) => ({ ...h, id: `s${i}` }))))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0]).toHaveLength(3)
  })

  it('a partial failure keeps only the unsaved line, and a retry sends only that one', async () => {
    const onSave = vi
      .fn<(h: { nickname: string; id: string }[]) => Promise<unknown[]>>()
      .mockImplementationOnce(async (h) => h.map((x) => (x.nickname === 'HDFC NRE' ? null : { ...x, id: x.nickname })))
      .mockImplementationOnce(async (h) => h.map((x) => ({ ...x, id: x.nickname })))
    const onDone = vi.fn()
    await reviewScreen(COMPLETE, onSave as never, onDone)
    fireEvent.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Saved 2. 1 account couldn’t be saved and is still below.')
    expect(names()).toEqual(['HDFC NRE'])
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(saveButton())
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[1][0].map((h) => h.nickname)).toEqual(['HDFC NRE'])
    // The retried line carries the same key as its first attempt, so the server can tell it is a repeat.
    const firstTry = onSave.mock.calls[0][0] as { nickname: string; id: string }[]
    const retry = onSave.mock.calls[1][0] as { nickname: string; id: string }[]
    expect(retry[0].id).toBe(firstTry.find((h) => h.nickname === 'HDFC NRE')!.id)
    expect(new Set(firstTry.map((h) => h.id)).size).toBe(3) // and every line has its own key
  })
})

describe('input rules: clear errors, same as the Add account form', () => {
  const typeAmount = (name: string, text: string) => {
    const box = within(rowOf(name)).getByLabelText(/^(Balance|Amount owed)$/)
    fireEvent.change(box, { target: { value: text } })
    fireEvent.keyDown(box, { key: 'Enter' })
    return box as HTMLInputElement
  }

  it.each([
    ['40L', '4000000'],
    ['1.2Cr', '12000000'],
    ['95k', '95000'],
    ['1.5M', '1500000'],
  ])('accepts %s', async (text) => {
    await reviewScreen(COMPLETE)
    typeAmount('Chase checking', text)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('refuses a negative with a message about entering what you owe as positive, and keeps what was typed', async () => {
    await reviewScreen(COMPLETE)
    const box = typeAmount('Home loan', '-80L')
    expect(screen.getByRole('alert')).toHaveTextContent('Amounts can’t be negative. Enter what you owe as a positive number.')
    expect(box.value).toBe('-80L')
    expect(saveButton()).toBeDisabled() // an unreadable amount is no amount
    expect(screen.getByText('1 needs an amount')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: '80L' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(saveButton()).toBeEnabled()
  })

  it('never saves an older number than the one on screen after a bad edit', async () => {
    const onSave = vi.fn(async (h: unknown[]) => h)
    await reviewScreen(COMPLETE, onSave)
    typeAmount('Chase checking', 'abc') // was 5,000
    expect(screen.getByRole('alert')).toHaveTextContent('Use numbers, or 40L / 1.2Cr / 95k / 1.5M')
    expect(saveButton()).toBeDisabled()
    fireEvent.click(saveButton())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses more than 2 decimals instead of rounding them away', async () => {
    await reviewScreen(COMPLETE)
    typeAmount('Chase checking', '12.345')
    expect(screen.getByRole('alert')).toHaveTextContent('Use at most 2 decimal places.')
    expect(saveButton()).toBeDisabled()
  })

  it('allows zero: it is an amount, so the line is complete and Save is on', async () => {
    await reviewScreen(COMPLETE)
    typeAmount('Chase checking', '0')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/need.* an amount/)).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    expect(within(rowOf('Chase checking')).getByLabelText('Balance', { exact: true }).className).not.toContain('border-saffron')
  })

  it('a name of 60 characters is fine; 61 is refused with how long it is, and holds back Save', async () => {
    await reviewScreen(COMPLETE)
    const nameBox = () => within(rowOf('Chase checking')).getByDisplayValue('Chase checking') as HTMLInputElement
    fireEvent.change(nameBox(), { target: { value: 'a'.repeat(60) } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()

    const long = within(rowOf('a'.repeat(60))).getByDisplayValue('a'.repeat(60))
    fireEvent.change(long, { target: { value: 'a'.repeat(61) } })
    expect(screen.getByRole('alert')).toHaveTextContent('Names can be up to 60 characters. This one is 61.')
    expect(screen.getByText('1 name is too long')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(saveButton()).toHaveAttribute('title', 'Not yet: 1 name is too long')
    // The text is not cut off behind the user's back.
    expect((screen.getByDisplayValue('a'.repeat(61)) as HTMLInputElement).value).toHaveLength(61)
  })
})
