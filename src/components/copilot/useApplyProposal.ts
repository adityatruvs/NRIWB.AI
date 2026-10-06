'use client'

import { useAccounts } from '@/context/AccountsContext'
import { useBudget, BUDGET_COLORS } from '@/context/BudgetContext'
import { useGoals } from '@/context/GoalsContext'
import { useCurrency } from '@/context/CurrencyContext'
import { accountToHolding, goalToGoal, type EditableProposal } from '@/components/copilot/ProposalCard'

/**
 * Apply an accepted Copilot proposal through the shared contexts, so the page
 * behind it updates at once. One implementation for the full Copilot page, the
 * Accounts "Add with AI" panel and the floating Copilot.
 */
export function useApplyProposal() {
  const { addManual, updateAccount } = useAccounts()
  const { categories, setIncome, addCategory, updateCategory } = useBudget()
  const { goals, addGoal, updateGoal } = useGoals()
  const { rate } = useCurrency()

  return (ep: EditableProposal) => {
    switch (ep.type) {
      case 'add_account':
        addManual(accountToHolding(ep.account, rate))
        break
      case 'update_account':
        if (ep.id) updateAccount(ep.id, accountToHolding(ep.account, rate))
        break
      case 'add_goal':
        addGoal(goalToGoal(ep.goal))
        break
      case 'update_goal':
        if (ep.id) {
          // Keep what the proposal doesn't carry (funding accounts, monthly plan, loan link).
          const { id: _id, ...existing } = goals.find((g) => g.id === ep.id) ?? { id: '' }
          updateGoal(ep.id, { ...existing, ...goalToGoal(ep.goal) })
        }
        break
      case 'set_income':
        setIncome(ep.amount)
        break
      case 'add_category':
        addCategory({
          label: ep.label,
          amount: ep.amount,
          color: BUDGET_COLORS[categories.length % BUDGET_COLORS.length],
        })
        break
      case 'update_category':
        updateCategory(ep.id, { label: ep.label, amount: ep.amount })
        break
    }
  }
}
