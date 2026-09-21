'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  Scale,
  Wallet,
  TrendingUp,
  PiggyBank,
  Target,
  Plus,
  Clock,
  Square,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { CopilotLogo } from '@/components/ui/logos'
import { useAccounts } from '@/context/AccountsContext'
import { useCurrency } from '@/context/CurrencyContext'
import { useBudget, BUDGET_COLORS } from '@/context/BudgetContext'
import { useGoals } from '@/context/GoalsContext'
import { useProfile } from '@/context/ProfileContext'
import { netWorth } from '@/lib/portfolio'
import { formatUSD } from '@/lib/currency'
import { splitProposals, parseProposals } from '@/lib/copilot-actions'
import {
  ProposalCard,
  resolveProposal,
  accountToHolding,
  goalToGoal,
  type EditableProposal,
  type ProposalStatus,
} from '@/components/copilot/ProposalCard'
import { Rich, Typing, AssistantAvatar } from '@/components/copilot/chat-ui'
import { cn } from '@/lib/utils'

interface ProposalItem {
  pid: string
  ep: EditableProposal
  status: ProposalStatus
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  followups?: string[]
  proposals?: ProposalItem[]
}

interface Chat {
  id: string
  title: string
  messages: Message[]
  updatedAt: number
}

const STORE_KEY = 'nriwb:copilot-chats'

const ERROR_TEXT =
  "Sorry — I couldn't reach Claude just now. Make sure **ANTHROPIC_API_KEY** is set in `.env.local`, restart the dev server, and try again."

const VIOLET = 'oklch(0.55 0.18 292)'

// What people actually open a finance app for — planning first, tax as one of many.
const CAPABILITIES = [
  { icon: TrendingUp, label: 'Net worth', desc: 'Track & project', accent: 'var(--brand)' },
  { icon: PiggyBank, label: 'Retirement', desc: 'Plan your number', accent: VIOLET },
  { icon: Wallet, label: 'Budget', desc: 'Cash flow & saving', accent: 'var(--india)' },
  { icon: ShieldCheck, label: 'US–India tax', desc: 'FBAR, PFIC, NRO', accent: 'var(--us)' },
]

interface Prompt {
  icon: LucideIcon
  tag: string
  accent: string
  text: string
}

/** Starter prompts spanning real money jobs; the goals one is personalized. */
function buildPrompts(topGoalName: string | null): Prompt[] {
  return [
    { icon: TrendingUp, tag: 'Plan', accent: 'var(--brand)', text: 'What will my net worth be in 5 years?' },
    { icon: PiggyBank, tag: 'Retire', accent: VIOLET, text: 'Can I afford to retire at 55?' },
    {
      icon: Target,
      tag: 'Goals',
      accent: 'var(--saffron)',
      text: topGoalName ? `Am I on track for ${topGoalName}?` : 'Am I on track for my goals?',
    },
    { icon: Wallet, tag: 'Budget', accent: 'var(--india)', text: 'Where does my money go each month?' },
    { icon: Scale, tag: 'Tax', accent: 'var(--us)', text: 'How do I cut tax on my NRO account?' },
    { icon: ShieldCheck, tag: 'Tax', accent: 'var(--warning)', text: 'Do I need to file FBAR this year?' },
  ]
}

/** First user line, trimmed to a tidy chat title. */
function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 42 ? `${t.slice(0, 42)}…` : t || 'New chat'
}

/** Short "2h ago" style stamp for the history list. */
function relTime(ts: number, now: number): string {
  const d = Math.max(0, now - ts)
  const min = 60_000
  const hr = 60 * min
  const day = 24 * hr
  if (d < min) return 'just now'
  if (d < hr) return `${Math.floor(d / min)}m ago`
  if (d < day) return `${Math.floor(d / hr)}h ago`
  if (d < 7 * day) return `${Math.floor(d / day)}d ago`
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function CopilotPage() {
  const { holdings, addManual, updateAccount } = useAccounts()
  const { rate } = useCurrency()
  const { income, categories, setIncome, addCategory, updateCategory } = useBudget()
  const { goals, addGoal, updateGoal } = useGoals()
  const { age } = useProfile()
  const nw = netWorth(holdings, rate)
  const idBase = useId()

  // Monthly investing — same basis as the analyzer/budget (the "invest" lines).
  const monthlyContribution = categories
    .filter((c) => /invest/i.test(c.label))
    .reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0)

  // Personalize the goals starter prompt with the user's actual top goal.
  const topGoalName = goals.find((g) => g.category === 'retirement')?.name ?? goals[0]?.name ?? null
  const prompts = buildPrompts(topGoalName)

  // Saved chats — each conversation persists so the user can return to it.
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState('')
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const hydrated = useRef(false)
  const counter = useRef(0)
  const nextId = () => `${idBase}-${counter.current++}`

  const active = chats.find((c) => c.id === activeId) ?? null
  const messages = active?.messages ?? []
  const generating = thinking || streamingId !== null
  const empty = messages.length === 0

  // Hydrate saved chats (client-only), or seed one empty conversation.
  useEffect(() => {
    let loaded: Chat[] | null = null
    let savedActive = ''
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { chats?: Chat[]; activeId?: string }
        if (Array.isArray(parsed.chats) && parsed.chats.length) {
          loaded = parsed.chats
          savedActive = parsed.activeId ?? ''
        }
      }
    } catch {
      /* ignore */
    }
    if (loaded) {
      setChats(loaded)
      setActiveId(loaded.some((c) => c.id === savedActive) ? savedActive : loaded[0].id)
    } else {
      const c: Chat = { id: crypto.randomUUID(), title: 'New chat', messages: [], updatedAt: Date.now() }
      setChats([c])
      setActiveId(c.id)
    }
    hydrated.current = true
  }, [])

  // Persist on every change so chats survive reloads.
  useEffect(() => {
    if (!hydrated.current) return
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ chats, activeId }))
    } catch {
      /* ignore */
    }
  }, [chats, activeId])

  // Arriving from elsewhere (e.g. the Accounts "Add with AI" box) with ?q=… —
  // send it once the chat is ready, then clean it out of the URL.
  const sentQuery = useRef(false)
  useEffect(() => {
    if (sentQuery.current || !activeId) return
    try {
      const q = new URLSearchParams(window.location.search).get('q')
      if (q && q.trim()) {
        sentQuery.current = true
        window.history.replaceState({}, '', '/copilot')
        send(q)
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  // Keep pinned to the latest message — unless the user scrolled up to read history.
  useEffect(() => {
    if (atBottom) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking, atBottom])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }
  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  // Auto-grow the composer up to a few lines, then scroll inside.
  function autoGrow() {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }
  useEffect(autoGrow, [input])

  function updateChat(chatId: string, fn: (c: Chat) => Chat) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? fn(c) : c)))
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
  }

  function newChat() {
    stop()
    setHistoryOpen(false)
    setInput('')
    const cur = chats.find((c) => c.id === activeId)
    if (cur && cur.messages.length === 0) return // already on a fresh chat
    const c: Chat = { id: crypto.randomUUID(), title: 'New chat', messages: [], updatedAt: Date.now() }
    setChats((prev) => [c, ...prev])
    setActiveId(c.id)
  }

  function selectChat(id: string) {
    stop()
    setActiveId(id)
    setHistoryOpen(false)
    setAtBottom(true)
  }

  function deleteChat(id: string) {
    const next = chats.filter((c) => c.id !== id)
    if (next.length === 0) {
      const c: Chat = { id: crypto.randomUUID(), title: 'New chat', messages: [], updatedAt: Date.now() }
      setChats([c])
      setActiveId(c.id)
    } else {
      setChats(next)
      if (id === activeId) setActiveId(next[0].id)
    }
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || generating || !activeId) return
    const chatId = activeId
    const prior = messages
    const userMsg: Message = { id: nextId(), role: 'user', text: trimmed }
    updateChat(chatId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? titleFrom(trimmed) : c.title,
      messages: [...c.messages, userMsg],
      updatedAt: Date.now(),
    }))
    setInput('')
    setThinking(true)
    setAtBottom(true)

    const controller = new AbortController()
    abortRef.current = controller
    let assistantId: string | null = null
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...prior, userMsg].map(({ role, text }) => ({ role, text })),
          holdings,
          rate,
          income,
          monthlyContribution,
          age,
          goals,
        }),
      })
      if (!res.ok || !res.body) throw new Error(`Copilot request failed (${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const delta = decoder.decode(value, { stream: true })
        if (!delta) continue
        acc += delta
        if (assistantId === null) {
          const id = nextId()
          assistantId = id
          setThinking(false)
          setStreamingId(id)
          updateChat(chatId, (c) => ({
            ...c,
            messages: [...c.messages, { id, role: 'assistant', text: acc }],
            updatedAt: Date.now(),
          }))
        } else {
          const id = assistantId
          updateChat(chatId, (c) => ({
            ...c,
            messages: c.messages.map((m) => (m.id === id ? { ...m, text: acc } : m)),
          }))
        }
      }
      if (assistantId === null) throw new Error('Empty response')

      // Stream done — extract any proposed changes, resolve them to editable
      // entities, and attach them to the assistant message as cards.
      const { visible, tail } = splitProposals(acc)
      const items: ProposalItem[] = tail
        ? parseProposals(tail)
            .map((raw) =>
              resolveProposal(raw, {
                holdings,
                goals,
                categories,
                currentYear: new Date().getFullYear(),
              }),
            )
            .filter((ep): ep is EditableProposal => ep !== null)
            .map((ep) => ({ pid: nextId(), ep, status: 'pending' as ProposalStatus }))
        : []
      const finalId = assistantId
      updateChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === finalId ? { ...m, text: visible, proposals: items.length ? items : undefined } : m,
        ),
      }))
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      if (assistantId === null && !aborted) {
        updateChat(chatId, (c) => ({
          ...c,
          messages: [...c.messages, { id: nextId(), role: 'assistant', text: ERROR_TEXT }],
        }))
      }
    } finally {
      setThinking(false)
      setStreamingId(null)
      abortRef.current = null
    }
  }

  // ── Proposal handlers ───────────────────────────────────────────────────────
  function patchProposal(messageId: string, pid: string, fn: (p: ProposalItem) => ProposalItem) {
    updateChat(activeId, (c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.id === messageId
          ? { ...m, proposals: m.proposals?.map((p) => (p.pid === pid ? fn(p) : p)) }
          : m,
      ),
    }))
  }

  function editProposal(messageId: string, pid: string, ep: EditableProposal) {
    patchProposal(messageId, pid, (p) => ({ ...p, ep }))
  }

  function discardProposal(messageId: string, pid: string) {
    patchProposal(messageId, pid, (p) => ({ ...p, status: 'discarded' }))
  }

  /** Apply a proposal through the shared contexts, then mark it applied. */
  function acceptProposal(messageId: string, pid: string, ep: EditableProposal) {
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
    patchProposal(messageId, pid, (p) => ({ ...p, status: 'applied' }))
  }

  return (
    <div className="flex h-[calc(100dvh-8.2rem)] flex-col gap-4">
      {/* Header (raised so the history popover sits above the chat card) */}
      <div className="relative z-50 flex items-center justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="ai-chip relative flex size-10 items-center justify-center rounded-xl shadow-[0_2px_10px_-3px_rgba(80,120,255,0.5)]">
            <span className="absolute inset-0 rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" />
            <CopilotLogo size={18} />
          </span>
          <div>
            <h1 className="flex items-center gap-2 font-serif text-[1.05rem] font-medium tracking-tight">
              Wealth Copilot
              <span className="inline-flex items-center gap-1 rounded-full bg-success-muted/80 px-2 py-0.5 text-[11px] font-medium text-success ring-1 ring-success/20">
                <span className="size-1 rounded-full bg-success" />
                online
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Aware of your {holdings.length} accounts · {formatUSD(nw.totalUsd)} net worth
            </p>
          </div>
        </div>

        {/* New chat + history */}
        <div className="flex items-center gap-2">
          <button
            onClick={newChat}
            className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setHistoryOpen((o) => !o)}
              className={cn(
                'btn-ghost inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-medium',
                historyOpen && 'bg-accent text-foreground',
              )}
            >
              <Clock size={15} />
              <span className="hidden sm:inline">History</span>
            </button>
            {historyOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setHistoryOpen(false)} />
                <HistoryPanel
                  chats={chats}
                  activeId={activeId}
                  onSelect={selectChat}
                  onDelete={deleteChat}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Conversation */}
      <div className="card-surface relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent"
        />
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {empty ? (
            <EmptyState onPick={send} prompts={prompts} />
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-5">
              {messages.map((m) => (
                <Bubble
                  key={m.id}
                  message={m}
                  onFollowup={send}
                  streaming={m.id === streamingId}
                  onAccept={(pid, ep) => acceptProposal(m.id, pid, ep)}
                  onEdit={(pid, ep) => editProposal(m.id, pid, ep)}
                  onDiscard={(pid) => discardProposal(m.id, pid)}
                />
              ))}
              {thinking && <Typing />}
            </div>
          )}
        </div>

        {/* Jump-to-latest — appears only when scrolled up mid-conversation */}
        {!empty && !atBottom && (
          <button
            onClick={scrollToBottom}
            aria-label="Scroll to latest"
            className="absolute bottom-[6.75rem] left-1/2 z-10 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border/70 bg-card/95 text-muted-foreground shadow-[0_4px_16px_-4px_hsl(var(--shadow-color)/0.25)] backdrop-blur transition-all hover:text-foreground animate-fade-in-up"
          >
            <ArrowDown size={16} />
          </button>
        )}

        {/* Composer */}
        <div className="border-t border-border/50 bg-gradient-to-b from-transparent to-muted/30 px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
              className="flex items-end gap-2 rounded-[1.75rem] border border-input/80 bg-card/95 p-2 pl-4 shadow-[0_2px_10px_-4px_hsl(var(--shadow-color)/0.1),0_12px_36px_-16px_hsl(var(--shadow-color)/0.22)] backdrop-blur transition-all duration-300 ease-out focus-within:border-brand/55 focus-within:shadow-[0_2px_10px_-4px_hsl(var(--shadow-color)/0.12),0_14px_44px_-16px_color-mix(in_oklch,var(--brand)_32%,transparent)] focus-within:ring-[3px] focus-within:ring-brand/12"
            >
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={autoGrow}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (!generating) send(input)
                  }
                }}
                rows={1}
                placeholder="Ask anything — net worth, retirement, budgeting, or US–India tax…"
                className="max-h-40 flex-1 resize-none self-center bg-transparent py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
              />
              {generating ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop generating"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-sm transition-all hover:bg-accent active:scale-95"
                >
                  <Square size={12} className="fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send"
                  className="btn-primary flex size-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowUp size={16} />
                </button>
              )}
            </form>
            <p className="mt-2.5 text-center text-[12px] text-muted-foreground/80">
              Informational only — not tax, legal, or financial advice. Verify with a licensed CPA.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Chat history panel ────────────────────────────────────────────────────── */
function HistoryPanel({
  chats,
  activeId,
  onSelect,
  onDelete,
}: {
  chats: Chat[]
  activeId: string
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const now = Date.now()
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
  return (
    <div className="absolute right-0 top-full z-40 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-border/70 bg-popover shadow-[0_12px_40px_-12px_hsl(var(--shadow-color)/0.32)] animate-scale-in">
      <div className="border-b border-border/60 px-3 py-2">
        <span className="eyebrow !text-[11px]">Your chats</span>
      </div>
      <div className="max-h-80 overflow-y-auto p-1.5">
        {sorted.map((c) => {
          const isActive = c.id === activeId
          return (
            <div
              key={c.id}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors',
                isActive ? 'bg-accent/70' : 'hover:bg-accent/40',
              )}
            >
              <button onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {c.title || 'New chat'}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {c.messages.length > 0 ? relTime(c.updatedAt, now) : 'empty'}
                </span>
              </button>
              <button
                onClick={() => onDelete(c.id)}
                aria-label="Delete chat"
                className="shrink-0 text-muted-foreground/40 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Empty state ───────────────────────────────────────────────────────────── */
function EmptyState({ onPick, prompts }: { onPick: (q: string) => void; prompts: Prompt[] }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-6 text-center animate-fade-in">
      <div className="relative">
        <span
          aria-hidden
          className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,#5b8cff55,transparent_70%)] blur-xl"
        />
        <span className="animate-float-slow ai-chip relative flex size-14 items-center justify-center rounded-2xl shadow-[0_8px_28px_-8px_rgba(80,120,255,0.55)]">
          <span className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.22)]" />
          <CopilotLogo size={24} />
        </span>
      </div>
      <h2 className="mt-6 font-serif text-[1.5rem] font-medium tracking-tight">
        What can I help you with?
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        I know your accounts, budget, and goals — ask me to project your net worth,
        plan retirement, find spending, or sort out US–India tax.
      </p>

      {/* Capability strip — the jobs people open a finance app for */}
      <div className="mt-7 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4">
        {CAPABILITIES.map((c, i) => (
          <div
            key={c.label}
            className="group rounded-2xl border border-border/70 bg-card p-3.5 text-left shadow-[0_1px_2px_hsl(var(--shadow-color)/0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-6px_hsl(var(--shadow-color)/0.14)] animate-fade-in-up"
            style={{ ['--cap' as string]: c.accent, animationDelay: `${i * 0.05}s` }}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--cap)_12%,var(--card))] text-[var(--cap)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--cap)_20%,transparent)] transition-transform group-hover:scale-110">
              <c.icon size={14} />
            </span>
            <p className="mt-2.5 text-xs font-semibold">{c.label}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>

      {/* Starter prompts — tap to ask */}
      <div className="mt-6 w-full">
        <p className="eyebrow mb-2 text-left">Try asking</p>
        <div className="grid w-full gap-2.5 sm:grid-cols-2">
          {prompts.map((p, i) => {
            const Icon = p.icon
            return (
              <button
                key={p.text}
                onClick={() => onPick(p.text)}
                style={{ ['--pa' as string]: p.accent, animationDelay: `${0.1 + i * 0.04}s` }}
                className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left shadow-[0_1px_2px_hsl(var(--shadow-color)/0.03)] transition-all hover:-translate-y-0.5 hover:border-[color-mix(in_oklch,var(--pa)_45%,var(--border))] hover:shadow-[0_4px_14px_-4px_hsl(var(--shadow-color)/0.14)] animate-fade-in-up"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--pa)_12%,var(--card))] text-[var(--pa)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--pa)_20%,transparent)] transition-transform group-hover:scale-110">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--pa)]">
                    {p.tag}
                  </span>
                  <span className="block text-[13px] leading-snug text-foreground">{p.text}</span>
                </span>
                <ArrowUp
                  size={14}
                  className="shrink-0 rotate-45 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Message bubble ────────────────────────────────────────────────────────── */
function Bubble({
  message,
  onFollowup,
  streaming,
  onAccept,
  onEdit,
  onDiscard,
}: {
  message: Message
  onFollowup: (q: string) => void
  streaming?: boolean
  onAccept: (pid: string, ep: EditableProposal) => void
  onEdit: (pid: string, ep: EditableProposal) => void
  onDiscard: (pid: string) => void
}) {
  const isUser = message.role === 'user'
  // While streaming the raw text still holds the proposals tail — hide it.
  const visible = isUser ? message.text : splitProposals(message.text).visible
  return (
    <div className={cn('flex gap-3 animate-fade-in-up', isUser && 'flex-row-reverse')}>
      {!isUser && <AssistantAvatar />}
      <div className={cn('flex w-full max-w-[85%] flex-col gap-2', isUser && 'items-end')}>
        {(visible || streaming || isUser) && (
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
                {streaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] -mb-0.5 animate-pulse rounded-full bg-brand align-middle" />
                )}
              </>
            )}
          </div>
        )}
        {/* Proposed changes — editable cards the user accepts, edits, or discards */}
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
        {message.followups && (
          <div className="flex flex-wrap gap-1.5">
            {message.followups.map((f) => (
              <button
                key={f}
                onClick={() => onFollowup(f)}
                className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-all hover:border-brand/40 hover:bg-accent/50 hover:text-foreground"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

