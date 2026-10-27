// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Holding } from '@/lib/portfolio'
import type { Goal } from '@/lib/goals'

const account = (over: Partial<Holding>): Holding => ({
  id: 'a1',
  nickname: 'Chase Savings',
  institution: 'Chase',
  accountType: 'savings',
  country: 'US',
  balanceUsd: 40_000,
  balanceInr: 0,
  isPfic: false,
  source: 'manual',
  ...over,
})
const holdings: Holding[] = [account({}), account({ id: 'a2', nickname: 'Ally Savings', balanceUsd: 10_000 })]

// Saved while the account held $5,000; it has grown since, so the stored figure is stale.
const goal = (linkedAccountIds: string[]): Goal => ({
  id: 'g1',
  name: 'House deposit',
  category: 'property',
  targetUsd: 100_000,
  currentUsd: 5_000,
  targetYear: 2040,
  kind: 'investment',
  linkedAccountIds,
})

const updateGoal = vi.fn()
const state = vi.hoisted(() => ({ goals: [] as Goal[] }))
vi.mock('next/link', () => ({
  default: (p: { children: React.ReactNode; href: string }) => <a href={p.href}>{p.children}</a>,
}))
vi.mock('@/components/SearchParamsReader', () => ({ SearchParamsReader: () => null }))
vi.mock('@/context/CurrencyContext', () => ({ useCurrency: () => ({ mode: 'USD', rate: 85 }) }))
vi.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ age: 35, countryOfResidence: 'US' }),
}))
vi.mock('@/context/AccountsContext', () => ({ useAccounts: () => ({ holdings }) }))
vi.mock('@/context/GoalsContext', () => ({
  useGoals: () => ({ goals: state.goals, loading: false, addGoal: vi.fn(), updateGoal, removeGoal: vi.fn() }),
}))

const { default: GoalsPage } = await import('./page')

afterEach(() => {
  cleanup()
  updateGoal.mockReset()
  state.goals = []
})

function openEdit(linked: string[]) {
  state.goals = [goal(linked)]
  render(<GoalsPage />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit House deposit' }))
  return screen.getByText('Edit goal').closest('div.card-surface') as HTMLElement
}
const tick = (dialog: HTMLElement, nickname: string) =>
  fireEvent.click(within(dialog).getByText(nickname).closest('button') as HTMLElement)

describe('unticking linked accounts in the goal dialog', () => {
  it('keeps "Saved so far" at what the last account held, not the stale saved figure', () => {
    const dialog = openEdit(['a1'])
    tick(dialog, 'Chase Savings')

    const manual = within(dialog).getAllByRole('textbox').find((el) => (el as HTMLInputElement).value === '40000')
    expect(manual).toBeDefined()
    expect(within(dialog).getByText(/Pick accounts and this goal funds itself/i)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))
    expect(updateGoal).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ currentUsd: 40_000, linkedAccountIds: undefined }),
    )
  })

  it('leaves the goal linked, and the amount derived, while another account is still ticked', () => {
    const dialog = openEdit(['a1', 'a2'])
    tick(dialog, 'Chase Savings')

    expect(within(dialog).getByText(/1 account linked/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))
    expect(updateGoal).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ currentUsd: 10_000, linkedAccountIds: ['a2'] }),
    )
  })
})
