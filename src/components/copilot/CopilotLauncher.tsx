'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowUp, Expand, Sparkles, Square, X } from 'lucide-react'
import { useAccounts } from '@/context/AccountsContext'
import { useCurrency } from '@/context/CurrencyContext'
import { useBudget } from '@/context/BudgetContext'
import { useGoals } from '@/context/GoalsContext'
import { useCopilotStream, type StreamMessage } from '@/components/copilot/useCopilotStream'
import { useApplyProposal } from '@/components/copilot/useApplyProposal'
import { PanelBubble } from '@/components/copilot/AiAddPanel'
import { Typing } from '@/components/copilot/chat-ui'
import { cn } from '@/lib/utils'

/** Suggested prompts per page (the part of the app the user is looking at). */
const PAGE_PROMPTS: { match: (p: string) => boolean; prompts: string[] }[] = [
  {
    match: (p) => p.startsWith('/accounts'),
    prompts: ['Which accounts are stale?', 'How much of my money is in India?', 'Should I move NRO savings to NRE?'],
  },
  {
    match: (p) => p.startsWith('/goals'),
    prompts: ['Am I on track for retirement?', 'Which goal is furthest behind?', 'How much more should I save each month?'],
  },
  {
    match: (p) => p.startsWith('/budget'),
    prompts: ['Where does my money go each month?', 'What is my savings rate?', 'How much can I invest each month?'],
  },
  {
    match: (p) => p.startsWith('/analyzer'),
    prompts: ['How does my allocation compare to the recommendation?', 'Can I retire at 55?', 'What drives my expected return?'],
  },
  {
    match: (p) => p.startsWith('/compliance'),
    prompts: ['Do I need to file FBAR this year?', 'Are my India mutual funds PFICs?', 'What is the difference between FBAR and FATCA?'],
  },
  {
    match: (p) => p.startsWith('/deadlines'),
    prompts: ['When is FBAR due?', 'What US and India filing dates are coming up?', 'Do I need Form 15CA to send money to the US?'],
  },
  {
    match: () => true,
    prompts: ['What needs my attention this month?', 'What will my net worth be in 5 years?', 'Do I need to file FBAR this year?'],
  },
]

/** The suggested prompts for a page (first match wins; the last entry is the catch-all). */
export function promptsFor(pathname: string): string[] {
  return PAGE_PROMPTS.find((x) => x.match(pathname))!.prompts
}

// The full Copilot page's chat store (see app/(app)/copilot/page.tsx).
const CHAT_STORE_KEY = 'nriwb:copilot-chats'
const PANEL_WIDTH = 420

/** Where the launcher doesn't belong: the Copilot itself, auth and Plaid screens. */
const hiddenOn = (p: string) =>
  p.startsWith('/copilot') || p.startsWith('/sign-in') || p.startsWith('/sign-up') || p.startsWith('/plaid')

/**
 * Copilot one click away on every signed-in page. Mounted once in the app shell,
 * so navigating between pages (or closing the panel) never drops a reply that's
 * still streaming. Desktop: a right-side panel that pushes the page over rather
 * than covering it. Mobile: a full-screen sheet. Ctrl/Cmd+J toggles; Esc closes.
 */
export function CopilotLauncher() {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const { holdings, demo } = useAccounts()
  const { rate } = useCurrency()
  const { categories } = useBudget()
  const { goals } = useGoals()
  const applyProposal = useApplyProposal()
  const chat = useCopilotStream({ holdings, rate, demo, goals, categories })

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hidden = hiddenOn(pathname)
  const prompts = promptsFor(pathname)

  const close = useCallback(() => {
    setOpen(false)
    // Focus goes back to where it came from.
    requestAnimationFrame(() => buttonRef.current?.focus())
  }, [])

  // Ctrl/Cmd+J toggles; Escape closes (the reply keeps streaming in the background).
  useEffect(() => {
    if (hidden) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        if (open) close()
        else setOpen(true)
      } else if (e.key === 'Escape' && open) {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hidden, open, close])

  useEffect(() => {
    if (open) taRef.current?.focus()
  }, [open])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.messages, chat.thinking, open])

  // On wide screens the open panel reserves its width, so it never covers the
  // page's own buttons (see the [data-copilot-open] rule in globals.css).
  useEffect(() => {
    const on = open && !hidden
    document.body.toggleAttribute('data-copilot-open', on)
    return () => document.body.removeAttribute('data-copilot-open')
  }, [open, hidden])

  // Navigating to /copilot while open (e.g. via the sidebar) just closes the panel.
  useEffect(() => {
    if (hidden) setOpen(false)
  }, [hidden])

  function send(text: string) {
    const t = text.trim()
    if (!t || chat.generating) return
    setDraft('')
    chat.send(t)
  }

  /** Continue this conversation on the full Copilot page, as a saved chat. */
  function openFullView() {
    if (chat.generating || chat.messages.length === 0) {
      router.push('/copilot')
      return
    }
    try {
      const raw = localStorage.getItem(CHAT_STORE_KEY)
      const store = raw ? (JSON.parse(raw) as { chats?: unknown[]; activeId?: string }) : {}
      const id = crypto.randomUUID()
      const firstUser = chat.messages.find((m) => m.role === 'user')?.text.trim().replace(/\s+/g, ' ') ?? 'New chat'
      const saved = {
        id,
        title: firstUser.length > 42 ? `${firstUser.slice(0, 42)}…` : firstUser,
        // Prefix ids so they can't collide with the page's own message ids.
        messages: chat.messages.map((m: StreamMessage) => ({
          ...m,
          id: `fv-${id}-${m.id}`,
          proposals: m.proposals?.map((p) => ({ ...p, pid: `fv-${id}-${p.pid}` })),
        })),
        updatedAt: Date.now(),
      }
      localStorage.setItem(
        CHAT_STORE_KEY,
        JSON.stringify({ chats: [saved, ...(Array.isArray(store.chats) ? store.chats : [])], activeId: id }),
      )
      chat.reset() // the conversation now lives on the full page
    } catch {
      /* storage unavailable: still open the page */
    }
    setOpen(false)
    router.push('/copilot')
  }

  if (hidden) return null

  return (
    <>
      {!open && (
        <button
          ref={buttonRef}
          onClick={() => setOpen(true)}
          aria-label="Open Copilot (Ctrl+J)"
          aria-expanded={open}
          aria-controls="copilot-panel"
          title="Ask Copilot (Ctrl/⌘+J)"
          className="btn-ai fixed bottom-5 right-5 z-40 flex size-12 items-center justify-center rounded-full shadow-[0_8px_24px_-8px_rgba(80,120,255,0.6)] transition-transform hover:scale-105 active:scale-95"
        >
          <Sparkles size={19} className="ai-spark" />
          {chat.generating && (
            <span className="absolute right-1 top-1 size-2.5 animate-pulse rounded-full bg-success ring-2 ring-card" />
          )}
        </button>
      )}

      <section
        id="copilot-panel"
        role="dialog"
        aria-modal={false}
        aria-label="Copilot"
        // Kept mounted while closed, so an in-progress answer and the thread survive.
        className={cn(
          'card-surface fixed z-50 flex-col overflow-hidden !rounded-none',
          open ? 'flex' : 'hidden',
          // Mobile: a full-screen sheet. Desktop: a panel under the top bar.
          'inset-0 lg:inset-auto lg:bottom-4 lg:right-4 lg:top-[76px] lg:!rounded-2xl',
        )}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border/50 px-4 py-3">
          <span className="ai-chip flex size-8 items-center justify-center rounded-lg">
            <Sparkles size={14} className="text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[15px] font-medium tracking-tight">Copilot</h2>
            <p className="truncate text-[11.5px] text-muted-foreground">Grounded on your accounts, goals and budget</p>
          </div>
          <button
            onClick={openFullView}
            title="Open full view"
            aria-label="Open full view"
            className="btn-ghost flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <Expand size={14} />
          </button>
          <button
            onClick={close}
            title="Close (Esc)"
            aria-label="Close Copilot"
            className="btn-ghost flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
          {chat.messages.length === 0 ? (
            <div className="flex flex-col gap-2 pt-2">
              <p className="px-1 text-[12px] font-medium text-muted-foreground">Try asking</p>
              {prompts.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left text-[13px] text-muted-foreground transition-all hover:border-brand/40 hover:text-foreground"
                >
                  <Sparkles size={12} className="shrink-0 text-brand/70" />
                  {q}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {chat.messages.map((m) => (
                <PanelBubble
                  key={m.id}
                  message={m}
                  streaming={chat.streaming}
                  onAccept={(pid, ep) => {
                    applyProposal(ep)
                    chat.patchProposal(m.id, pid, (p) => ({ ...p, status: 'applied' }))
                  }}
                  onEdit={(pid, ep) => chat.patchProposal(m.id, pid, (p) => ({ ...p, ep }))}
                  onDiscard={(pid) => chat.patchProposal(m.id, pid, (p) => ({ ...p, status: 'discarded' }))}
                />
              ))}
              {chat.thinking && <Typing />}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
          className="m-3 flex shrink-0 items-end gap-2 rounded-2xl border border-input/80 bg-card p-1.5 pl-3.5 focus-within:border-brand/55 focus-within:ring-[3px] focus-within:ring-brand/12"
        >
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(draft)
              }
            }}
            rows={1}
            aria-label="Message Copilot"
            placeholder="Ask about your money…"
            className="max-h-28 flex-1 resize-none self-center bg-transparent py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/70"
          />
          {chat.generating ? (
            <button
              type="button"
              onClick={chat.stop}
              aria-label="Stop generating"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card"
            >
              <Square size={11} className="fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="btn-primary flex size-8 shrink-0 items-center justify-center rounded-full disabled:opacity-30"
            >
              <ArrowUp size={15} />
            </button>
          )}
        </form>
      </section>
      <style>{`@media (min-width: 1024px) { #copilot-panel { width: ${PANEL_WIDTH}px; } }`}</style>
    </>
  )
}
