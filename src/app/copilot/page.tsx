'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Sparkles, ArrowUp, ShieldCheck, FileText, Plane, Scale, Wallet } from 'lucide-react'
import { useAccounts } from '@/context/AccountsContext'
import { useCurrency } from '@/context/CurrencyContext'
import { netWorth } from '@/lib/portfolio'
import { formatUSD } from '@/lib/currency'
import { COPILOT_SUGGESTIONS } from '@/data/mock/insights'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  followups?: string[]
}

const ERROR_TEXT =
  "Sorry — I couldn't reach Claude just now. Make sure **ANTHROPIC_API_KEY** is set in `.env.local`, restart the dev server, and try again."

const CAPABILITIES = [
  { icon: ShieldCheck, label: 'FBAR & FATCA', desc: 'When and how to file', accent: 'var(--us)' },
  { icon: FileText, label: 'PFIC / Form 8621', desc: 'India mutual funds', accent: 'var(--warning)' },
  { icon: Scale, label: 'NRE / NRO tax', desc: 'Optimize & repatriate', accent: 'var(--india)' },
  { icon: Plane, label: 'Tax residency', desc: 'The 182-day rule', accent: 'var(--brand)' },
]

export default function CopilotPage() {
  const { holdings } = useAccounts()
  const { rate } = useCurrency()
  const nw = netWorth(holdings, rate)
  const idBase = useId()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const counter = useRef(0)
  const nextId = () => `${idBase}-${counter.current++}`

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || thinking) return
    const history = [...messages, { id: nextId(), role: 'user' as const, text: trimmed }]
    setMessages(history)
    setInput('')
    setThinking(true)

    // Stream the reply from Claude; the typing indicator stays up until the
    // first token arrives, then the bubble fills in token by token.
    let assistantId: string | null = null
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(({ role, text }) => ({ role, text })),
          holdings,
          rate,
        }),
      })
      if (!res.ok || !res.body) throw new Error(`Copilot request failed (${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const delta = decoder.decode(value, { stream: true })
        if (!delta) continue
        if (assistantId === null) {
          const id = nextId()
          assistantId = id
          setThinking(false)
          setMessages((m) => [...m, { id, role: 'assistant', text: delta }])
        } else {
          const id = assistantId
          setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, text: msg.text + delta } : msg)))
        }
      }
      if (assistantId === null) throw new Error('Empty response')
    } catch {
      if (assistantId === null) {
        setMessages((m) => [...m, { id: nextId(), role: 'assistant', text: ERROR_TEXT }])
      }
    } finally {
      setThinking(false)
    }
  }

  const empty = messages.length === 0

  return (
    <div className="flex h-[calc(100dvh-8.2rem)] flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="relative flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--us)] via-[var(--brand)] to-[var(--india)] text-white shadow-[0_4px_14px_-4px_color-mix(in_oklch,var(--brand)_60%,transparent)]">
            <span className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]" />
            <Sparkles size={18} />
          </span>
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
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
        <span className="hidden items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-[13px] text-muted-foreground shadow-sm ring-1 ring-border/80 sm:flex">
          <Wallet size={12} className="text-brand" />
          Claude Sonnet 4.6 · live
        </span>
      </div>

      {/* Conversation */}
      <div className="card-surface relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0 z-10 opacity-70" />
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {empty ? (
            <EmptyState onPick={send} />
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-5">
              {messages.map((m) => (
                <Bubble key={m.id} message={m} onFollowup={send} />
              ))}
              {thinking && <Typing />}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border/70 bg-gradient-to-b from-transparent to-muted/40 px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
              className="flex items-end gap-2 rounded-2xl border border-input bg-card p-1.5 pl-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05),0_4px_16px_-6px_hsl(var(--shadow-color)/0.1)] transition-all focus-within:border-brand/60 focus-within:shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05),0_4px_20px_-6px_color-mix(in_oklch,var(--brand)_25%,transparent)] focus-within:ring-[3px] focus-within:ring-brand/12"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
                rows={1}
                placeholder="Ask about FBAR, PFIC, NRO tax, repatriation…"
                className="max-h-32 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/70"
              />
              <button
                type="submit"
                disabled={!input.trim() || thinking}
                aria-label="Send"
                className="btn-primary flex size-9 shrink-0 items-center justify-center rounded-xl disabled:pointer-events-none disabled:opacity-30"
              >
                <ArrowUp size={16} />
              </button>
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

/* ── Empty state ───────────────────────────────────────────────────────────── */
function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-8 text-center animate-fade-in">
      <div className="relative">
        <span
          aria-hidden
          className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brand)_22%,transparent),transparent_70%)] blur-xl"
        />
        <span className="animate-float-slow relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--us)] via-[var(--brand)] to-[var(--india)] text-white shadow-[0_8px_24px_-6px_color-mix(in_oklch,var(--brand)_65%,transparent)]">
          <span className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]" />
          <Sparkles size={24} />
        </span>
      </div>
      <h2 className="mt-6 text-xl font-semibold tracking-tight">
        Your cross-border money, explained
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        I read your linked US and India accounts to answer compliance and tax
        questions in plain English — grounded in your actual balances.
      </p>

      <div className="mt-7 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
        {CAPABILITIES.map((c) => (
          <div
            key={c.label}
            className="group rounded-2xl border border-border/70 bg-card p-3.5 text-left shadow-[0_1px_2px_hsl(var(--shadow-color)/0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-6px_hsl(var(--shadow-color)/0.14)]"
            style={{ ['--cap' as string]: c.accent }}
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--cap)_12%,var(--card))] text-[var(--cap)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--cap)_20%,transparent)] transition-transform group-hover:scale-110">
              <c.icon size={14} />
            </span>
            <p className="mt-2.5 text-xs font-semibold">{c.label}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-7 flex w-full flex-col gap-2">
        <p className="eyebrow text-left">Try asking</p>
        {COPILOT_SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="group flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3 text-left text-sm shadow-[0_1px_2px_hsl(var(--shadow-color)/0.03)] transition-all hover:border-brand/35 hover:bg-accent/40 hover:shadow-[0_2px_8px_-2px_hsl(var(--shadow-color)/0.1)]"
          >
            <span>{q}</span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-all group-hover:bg-brand group-hover:text-brand-foreground">
              <ArrowUp size={13} className="rotate-45" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Message bubble ────────────────────────────────────────────────────────── */
function Bubble({ message, onFollowup }: { message: Message; onFollowup: (q: string) => void }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex gap-3 animate-fade-in-up', isUser && 'flex-row-reverse')}>
      {!isUser && <AssistantAvatar />}
      <div className={cn('flex max-w-[85%] flex-col gap-2', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'rounded-tr-sm bg-gradient-to-b from-[color-mix(in_oklch,var(--brand)_88%,white)] to-[var(--brand)] text-brand-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_2px_8px_-2px_color-mix(in_oklch,var(--brand)_45%,transparent)]'
              : 'rounded-tl-sm border border-border/60 bg-muted/60 text-foreground shadow-[0_1px_2px_hsl(var(--shadow-color)/0.03)]',
          )}
        >
          {isUser ? message.text : <Rich text={message.text} />}
        </div>
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

function AssistantAvatar() {
  return (
    <span className="relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--india)] text-white shadow-[0_2px_6px_-1px_color-mix(in_oklch,var(--brand)_50%,transparent)]">
      <span className="absolute inset-0 rounded-lg shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]" />
      <Sparkles size={13} />
    </span>
  )
}

function Typing() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <AssistantAvatar />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border/60 bg-muted/60 px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot size-1.5 rounded-full bg-muted-foreground/70"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Minimal rich-text renderer: paragraphs, **bold**, • bullets ──────────── */
function Rich({ text }: { text: string }) {
  const blocks = text.split('\n').filter((l) => l.length > 0)
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((line, i) => {
        const bullet = line.trim().startsWith('•')
        const content = bullet ? line.trim().slice(1).trim() : line
        return (
          <p key={i} className={cn(bullet && 'flex gap-2 pl-1')}>
            {bullet && <span className="text-brand">•</span>}
            <span>{renderBold(content)}</span>
          </p>
        )
      })}
    </div>
  )
}

function renderBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}
