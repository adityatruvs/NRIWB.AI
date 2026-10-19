// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Holding } from '@/lib/portfolio'
import type { Goal } from '@/lib/goals'

const LAKH = 100_000
const loan = (over: Partial<Holding>): Holding => ({
  id: 'l1',
  nickname: 'Bangalore home loan',
  institution: 'HDFC',
  accountType: 'home_loan',
  kind: 'liability',
  country: 'IN',
  balanceUsd: 0,
  balanceInr: 32 * LAKH,
  isPfic: false,
  source: 'manual',
  ...over,
})
const holdings: Holding[] = [
  loan({}),
  loan({ id: 'l2', nickname: 'Car loan', balanceInr: 5 * LAKH }),
  loan({ id: 'l3', nickname: 'US mortgage', accountType: 'mortgage', country: 'US', balanceInr: 0, balanceUsd: 250_000 }),
  loan({ id: 'a1', nickname: 'Savings', kind: 'asset', accountType: 'savings', balanceInr: 9 * LAKH }),
]

const addGoal = vi.fn()
const state = vi.hoisted(() => ({ goals: [] as Goal[], holdings: null as Holding[] | null }))
vi.mock('next/link', () => ({
  default: (p: { children: React.ReactNode; href: string }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('@/components/SearchParamsReader', () => ({ SearchParamsReader: () => null }))
vi.mock('@/context/CurrencyContext', () => ({ useCurrency: () => ({ mode: 'USD', rate: 85 }) }))
vi.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ age: 35, countryOfResidence: 'US' }),
}))
vi.mock('@/context/AccountsContext', () => ({ useAccounts: () => ({ holdings: state.holdings ?? holdings }) }))
vi.mock('@/context/GoalsContext', () => ({
  useGoals: () => ({ goals: state.goals, loading: false, addGoal, updateGoal: vi.fn(), removeGoal: vi.fn() }),
}))

const { default: GoalsPage } = await import('./page')

afterEach(() => {
  cleanup()
  addGoal.mockReset()
  state.goals = []
  state.holdings = null
})

function openDebtDialog() {
  render(<GoalsPage />)
  fireEvent.click(screen.getAllByRole('button', { name: /add goal/i })[0])
  const dialog = screen.getByText('Add a goal').closest('div.card-surface') as HTMLElement
  fireEvent.click(within(dialog).getByRole('button', { name: 'Debt payoff' }))
}
const radios = () => screen.getAllByRole('radio')
const startBalance = () => screen.getByLabelText(/starting balance/i) as HTMLInputElement
const nameInput = () => screen.getByPlaceholderText(/e\.g\. Retirement/i) as HTMLInputElement

describe('Debt payoff dialog (UI)', () => {
  it('offers only liabilities', () => {
    openDebtDialog()
    expect(radios().map((r) => r.textContent)).toEqual([
      expect.stringContaining('Bangalore home loan'),
      expect.stringContaining('Car loan'),
      expect.stringContaining('US mortgage'),
    ])
  })

  it('lets every liability be selected, one at a time, and the amount follows', () => {
    openDebtDialog()
    const [home, car, us] = radios()

    fireEvent.click(home)
    expect(home).toHaveAttribute('aria-checked', 'true')
    expect(startBalance().value).toBe(String(32 * LAKH))
    expect(nameInput().value).toBe('Pay off Bangalore home loan')

    fireEvent.click(car)
    expect(car).toHaveAttribute('aria-checked', 'true')
    expect(home).toHaveAttribute('aria-checked', 'false')
    expect(startBalance().value).toBe(String(5 * LAKH))
    expect(nameInput().value).toBe('Pay off Car loan')

    fireEvent.click(us)
    expect(us).toHaveAttribute('aria-checked', 'true')
    expect(startBalance().value).toBe('250000')

    fireEvent.click(home) // and back again
    expect(startBalance().value).toBe(String(32 * LAKH))
  })

  it('resets a typed amount when switching loans but keeps it on re-click', () => {
    openDebtDialog()
    const [home, car] = radios()
    fireEvent.click(home)
    fireEvent.change(startBalance(), { target: { value: String(60 * LAKH) } })
    fireEvent.click(home)
    expect(startBalance().value).toBe(String(60 * LAKH))
    fireEvent.click(car)
    expect(startBalance().value).toBe(String(5 * LAKH))
  })

  it('saves the goal against the last-selected loan with its amount', () => {
    openDebtDialog()
    const [home, car] = radios()
    fireEvent.click(home)
    fireEvent.click(car)
    const dialog = screen.getByText('Add a goal').closest('div.card-surface') as HTMLElement
    fireEvent.click(within(dialog).getByRole('button', { name: /^add goal$/i }))
    expect(addGoal).toHaveBeenCalledTimes(1)
    expect(addGoal.mock.calls[0][0]).toMatchObject({
      category: 'debt',
      linkedLiabilityId: 'l2',
      originalAmount: 5 * LAKH,
      name: 'Pay off Car loan',
    })
  })
})

describe('Debt payoff card (UI)', () => {
  const debtGoal = (over: Partial<Goal> = {}): Goal => ({
    id: 'g1',
    name: 'Clear the Bangalore home loan',
    category: 'debt',
    targetUsd: 0,
    currentUsd: 0,
    targetYear: 2028,
    linkedLiabilityId: 'l1',
    originalAmount: 60 * LAKH,
    ...over,
  })
  const show = (goals: Goal[], hs: Holding[] = holdings) => {
    state.goals = goals
    state.holdings = hs
    render(<GoalsPage />)
  }

  it('shows Rs 28L of Rs 60L repaid (47%) for an INR loan, whatever the FX rate', () => {
    show([debtGoal()])
    expect(screen.getByText(/repaid/i)).toHaveTextContent(/28(\.00)?L of ₹?60(\.00)?L repaid/i)
    expect(screen.getByText('47%')).toBeInTheDocument()
  })

  it('shows Reached when the balance is 0', () => {
    show([debtGoal()], [loan({ balanceInr: 0 })])
    expect(screen.getAllByText('Reached').length).toBeGreaterThan(0)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('asks for APR and minimum payment, linking to the loan edit dialog, instead of a status', () => {
    show([debtGoal()]) // fixture loans carry no details
    const edit = screen.getByRole('link', { name: /edit loan/i })
    expect(edit).toHaveAttribute('href', '/accounts?edit=l1')
    expect(screen.queryByText(/^(Ahead|On track|Behind|Overdue)$/)).toBeNull()
  })

  it('keeps the goal and says the loan was removed when it is deleted', () => {
    show([debtGoal({ linkedLiabilityId: undefined })])
    expect(screen.getByText('Clear the Bangalore home loan')).toBeInTheDocument()
    expect(screen.getByText(/loan removed/i, { selector: 'p' })).toHaveTextContent(/relink a loan.*or delete this goal/i)
  })

  it('survives a loan with a missing balance field (no NaN on screen)', () => {
    show([debtGoal()], [loan({ balanceInr: undefined as unknown as number })])
    expect(document.body.textContent).not.toMatch(/NaN/)
  })
})
