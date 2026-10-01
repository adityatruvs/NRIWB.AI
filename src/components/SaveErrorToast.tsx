'use client'

import { AlertTriangle, X } from 'lucide-react'
import { useGoals } from '@/context/GoalsContext'
import { useBudget } from '@/context/BudgetContext'

/**
 * App-wide notice for a save that failed and was rolled back. Mounted once in the
 * shell so it shows whichever page made the change (Goals, Budget, Analyzer, Copilot).
 */
export default function SaveErrorToast() {
  const goals = useGoals()
  const budget = useBudget()
  const source = goals.saveError ? goals : budget.saveError ? budget : null
  if (!source) return null
  const { saveError, clearSaveError } = source

  return (
    <div
      role="alert"
      className="card-surface fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-2.5 px-4 py-3 text-[13px] animate-fade-in"
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
      <p className="flex-1">{saveError}</p>
      <button
        onClick={clearSaveError}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  )
}
