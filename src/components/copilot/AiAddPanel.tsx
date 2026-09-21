'use client'

/**
 * "Add with AI" — an inline, self-contained account assistant that lives in the
 * Accounts side rail. Collapsed, it's a small prompt card. Clicking it morphs the
 * card (shared `layoutId`) into a large panel where the user describes an account,
 * reviews the proposed change as an editable card, and accepts it — applied
 * straight into the shared contexts, so the new account lands in the ledger
 * behind the panel. Minimizing morphs it back to the small card.
 *
 * It reuses the exact proposal pipeline as the full Copilot page (via
 * useCopilotStream + ProposalCard); it just drops chat history and persistence.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sparkles, ArrowUp, Minimize2, Square } from 'lucide-react'
import { CardHeader } from '@/components/ui/Card'
import { useAccounts } from '@/context/AccountsContext'
import { useCurrency } from '@/context/CurrencyContext'
import { useBudget, BUDGET_COLORS } from '@/context/BudgetContext'
import { useGoals } from '@/context/GoalsContext'
import { useProfile } from '@/context/ProfileContext'
import {
  ProposalCard,
  accountToHolding,
  goalToGoal,
  type EditableProposal,
} from '@/components/copilot/ProposalCard'
import { useCopilotStream } from '@/components/copilot/useCopilotStream'
import { Rich, Typing, AssistantAvatar } from '@/components/copilot/chat-ui'
import { splitProposals } from '@/lib/copilot-actions'
import { cn } from '@/lib/utils'

const EXAMPLES = [
  'Add a HYSA with $10k at 4.5%',
  'Add my ICICI NRE FD, ₹40L at 7%',
  'Add a $300k mortgage on my home',
]

const SURFACE_ID = 'ai-add-surface'

export function AiAdd() {
  const { holdings, addManual, updateAccount } = useAccounts()
  const { rate } = useCurrency()
  const { income, categories, setIncome, addCategory, updateCategory } = useBudget()
  const { goals, addGoal, updateGoal } = useGoals()
  const { age } = useProfile()

  // Same investing basis as the analyzer/budget — the "invest" budget lines.
  const monthlyContribution = categories
    .filter((c) => /invest/i.test(c.label))
    .reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0)

  const chat = useCopilotStream({
    holdings,
    rate,
    income,
    monthlyContribution,
    age,
    goals,
    categories,
  })

  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')

  /** Apply a proposal through the shared contexts, then mark its card applied. */
  function accept(messageId: string, pid: string, ep: EditableProposal) {
    switch (ep.type) {
      case 'add_account':
        addManual(accountToHolding(ep.account))
        break
      case 'update_account':
        if (ep.id) updateAccount(ep.id, accountToHolding(ep.account))
        break
      case 'add_goal':
        addGoal(goalToGoal(ep.goal))
        break
      case 'update_goal':
        if (ep.id) updateGoal(ep.id, goalToGoal(ep.goal))
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
    chat.patchProposal(messageId, pid, (p) => ({ ...p, status: 'applied' }))
  }

  function submit() {
    const t = draft.trim()
    if (!t) return
    setDraft('')
    setExpanded(true)
    chat.send(t)
  }

  function pickExample(text: string) {
    setExpanded(true)
    chat.send(text)
  }

  return (
    <>
      {/* ── Collapsed card (stays in the rail; fades out under the panel) ──── */}
      <motion.div
        layoutId={SURFACE_ID}
        animate={{ opacity: expanded ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        className="ai-ring p-5 sm:p-6"
      >
        <CardHeader
          title="Add with AI"
          subtitle="Describe it — Copilot fills in the details"
          icon={<Sparkles size={15} />}
        />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-1.5 rounded-2xl border border-input bg-card p-1.5 pl-3.5 text-left shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)] transition-all hover:border-brand/55"
        >
          <span className="min-w-0 flex-1 truncate py-1.5 text-[13px] text-muted-foreground/60">
            e.g. add my Amex HYSA, $10k at 4.5%
          </span>
          <span className="btn-primary flex size-8 shrink-0 items-center justify-center rounded-xl">
            <ArrowUp size={15} />
          </span>
        </button>

        <div className="mt-3 flex flex-col gap-1.5">
          {EXAMPLES.map((x) => (
            <button
              key={x}
              onClick={() => pickExample(x)}
              className="group flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-left text-[12px] text-muted-foreground transition-all hover:border-brand/35 hover:bg-accent/40 hover:text-foreground"
            >
              <Sparkles size={12} className="shrink-0 text-brand/70" />
              <span className="min-w-0 flex-1 truncate">{x}</span>
              <ArrowUp size={12} className="shrink-0 rotate-45 opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-snug text-muted-foreground/80">
          You&apos;ll review and accept each change here — nothing is added until you confirm.
        </p>
      </motion.div>

      {/* ── Expanded panel (morphs out of the card) ───────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setExpanded(false)}
            />
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
              <motion.div
                layoutId={SURFACE_ID}
                className="ai-ring pointer-events-auto flex h-[min(80dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden !p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <ExpandedPanel
                  chat={chat}
                  draft={draft}
                  setDraft={setDraft}
                  onSubmit={submit}
                  onExample={pickExample}
                  onClose={() => setExpanded(false)}
                  onAccept={accept}
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

/* ── The panel contents — thread + composer ─────────────────────────────────── */

function ExpandedPanel({
  chat,
  draft,
  setDraft,
  onSubmit,
  onExample,
  onClose,
  onAccept,
}: {
  chat: ReturnType<typeof useCopilotStream>
  draft: string
  setDraft: (v: string) => void
  onSubmit: () => void
  onExample: (text: string) => void
  onClose: () => void
  onAccept: (messageId: string, pid: string, ep: EditableProposal) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const { messages, thinking, streaming, generating } = chat
  const empty = messages.length === 0

  // Focus the composer as the panel opens, and keep pinned to the latest turn.
  useEffect(() => {
    taRef.current?.focus()
  }, [])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  // Escape closes the panel (unless mid-generation, where it stops instead).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (generating) chat.stop()
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [generating, chat, onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.12 }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-5 py-4">
        <span className="ai-chip relative flex size-9 items-center justify-center rounded-xl shadow-[0_2px_10px_-3px_rgba(80,120,255,0.5)]">
          <span className="absolute inset-0 rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" />
          <Sparkles size={16} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[1.05rem] font-medium tracking-tight">Add with AI</h2>
          <p className="text-xs text-muted-foreground">Describe an account — I&apos;ll fill in the details</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Minimize"
          title="Minimize"
          className="btn-ghost flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        >
          <Minimize2 size={15} />
        </button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {empty ? (
          <div className="mx-auto flex max-w-md flex-col items-center py-6 text-center animate-fade-in">
            <h3 className="font-serif text-[1.2rem] font-medium tracking-tight">What are we adding?</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Tell me the bank, balance, and rate — an account, a deposit, or a loan, US or India.
              I&apos;ll draft it and you confirm.
            </p>
            <div className="mt-5 flex w-full flex-col gap-2">
              {EXAMPLES.map((x) => (
                <button
                  key={x}
                  onClick={() => onExample(x)}
                  className="group flex items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-left text-[13px] text-muted-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.03)] transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:text-foreground"
                >
                  <Sparkles size={13} className="shrink-0 text-brand/70" />
                  <span className="min-w-0 flex-1">{x}</span>
                  <ArrowUp size={13} className="shrink-0 rotate-45 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-xl flex-col gap-5">
            {messages.map((m) => (
              <PanelBubble
                key={m.id}
                message={m}
                streaming={streaming}
                onAccept={(pid, ep) => onAccept(m.id, pid, ep)}
                onEdit={(pid, ep) => chat.patchProposal(m.id, pid, (p) => ({ ...p, ep }))}
                onDiscard={(pid) => chat.patchProposal(m.id, pid, (p) => ({ ...p, status: 'discarded' }))}
              />
            ))}
            {thinking && <Typing />}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border/50 bg-gradient-to-b from-transparent to-muted/30 px-4 py-4 sm:px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="mx-auto flex max-w-xl items-end gap-2 rounded-[1.5rem] border border-input/80 bg-card/95 p-2 pl-4 shadow-[0_2px_10px_-4px_hsl(var(--shadow-color)/0.1)] transition-all focus-within:border-brand/55 focus-within:ring-[3px] focus-within:ring-brand/12"
        >
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!generating) onSubmit()
              }
            }}
            rows={1}
            placeholder="e.g. add my Amex HYSA, $10k at 4.5%"
            className="max-h-32 flex-1 resize-none self-center bg-transparent py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
          />
          {generating ? (
            <button
              type="button"
              onClick={chat.stop}
              aria-label="Stop generating"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-sm transition-all hover:bg-accent active:scale-95"
            >
              <Square size={12} className="fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="btn-primary flex size-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 disabled:pointer-events-none disabled:opacity-30"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </form>
        <p className="mx-auto mt-2.5 max-w-xl text-center text-[11px] text-muted-foreground/80">
          Nothing is added until you accept the card.
        </p>
      </div>
    </motion.div>
  )
}

/* ── One turn in the panel thread ───────────────────────────────────────────── */

function PanelBubble({
  message,
  streaming,
  onAccept,
  onEdit,
  onDiscard,
}: {
  message: ReturnType<typeof useCopilotStream>['messages'][number]
  streaming: boolean
  onAccept: (pid: string, ep: EditableProposal) => void
  onEdit: (pid: string, ep: EditableProposal) => void
  onDiscard: (pid: string) => void
}) {
  const isUser = message.role === 'user'
  // While streaming, the raw text still carries the proposals tail — hide it.
  const visible = isUser ? message.text : splitProposals(message.text).visible
  const isStreaming = streaming && !isUser && !message.proposals
  return (
    <div className={cn('flex gap-3 animate-fade-in-up', isUser && 'flex-row-reverse')}>
      {!isUser && <AssistantAvatar />}
      <div className={cn('flex w-full max-w-[85%] flex-col gap-2', isUser && 'items-end')}>
        {(visible || isStreaming || isUser) && (
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
              isUser
                ? 'rounded-tr-sm bg-foreground text-background shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_2px_8px_-3px_hsl(var(--shadow-color)/0.3)]'
                : 'rounded-tl-sm border border-border/60 bg-muted/60 text-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.03)]',
            )}
          >
            {isUser ? (
              message.text
            ) : (
              <>
                <Rich text={visible} />
                {isStreaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] -mb-0.5 animate-pulse rounded-full bg-brand align-middle" />
                )}
              </>
            )}
          </div>
        )}
        {message.proposals?.map((p) => (
          <div key={p.pid} className="w-full">
            <ProposalCard
              proposal={p.ep}
              status={p.status}
              onChange={(ep) => onEdit(p.pid, ep)}
              onAccept={() => onAccept(p.pid, p.ep)}
              onDiscard={() => onDiscard(p.pid)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
