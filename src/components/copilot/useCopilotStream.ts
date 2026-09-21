'use client'

/**
 * A lightweight, ephemeral copilot thread — the transport behind the inline
 * "Add with AI" panel. Unlike the full Copilot page it keeps no history and no
 * persistence: the conversation lives only while the panel is open. It reuses
 * the same /api/copilot stream and the same proposal-resolution pipeline, so a
 * proposed change here is identical to one made in the full chat.
 */

import { useCallback, useRef, useState } from 'react'
import { splitProposals, parseProposals } from '@/lib/copilot-actions'
import {
  resolveProposal,
  type EditableProposal,
  type ProposalStatus,
} from '@/components/copilot/ProposalCard'
import type { Holding } from '@/lib/portfolio'
import type { Goal } from '@/lib/goals'
import type { BudgetCategory } from '@/context/BudgetContext'

export interface StreamProposal {
  pid: string
  ep: EditableProposal
  status: ProposalStatus
}

export interface StreamMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  proposals?: StreamProposal[]
}

/** Live grounding context — mirrors the payload the /api/copilot route expects. */
export interface CopilotContext {
  holdings: Holding[]
  rate: number
  income: number
  monthlyContribution: number
  age: number | null
  goals: Goal[]
  categories: BudgetCategory[]
}

const ERROR_TEXT =
  "Sorry — I couldn't reach Claude just now. Make sure **ANTHROPIC_API_KEY** is set in `.env.local`, restart the dev server, and try again."

export function useCopilotStream(ctx: CopilotContext) {
  const [messages, setMessages] = useState<StreamMessage[]>([])
  const [thinking, setThinking] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)

  // Refs so the async send() always reads the latest context and message list
  // without being torn down and recreated on every keystroke.
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const messagesRef = useRef<StreamMessage[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const counter = useRef(0)
  const nextId = () => `m${counter.current++}`

  const generating = thinking || streamingId !== null

  /** Update both the ref (read by send) and state (rendered) in lockstep. */
  const commit = useCallback((next: StreamMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const reset = useCallback(() => {
    stop()
    commit([])
    setThinking(false)
    setStreamingId(null)
  }, [stop, commit])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || abortRef.current) return
      const c = ctxRef.current

      const userMsg: StreamMessage = { id: nextId(), role: 'user', text: trimmed }
      const withUser = [...messagesRef.current, userMsg]
      commit(withUser)
      setThinking(true)

      const controller = new AbortController()
      abortRef.current = controller
      let assistantId: string | null = null
      let acc = ''
      try {
        const res = await fetch('/api/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: withUser.map(({ role, text }) => ({ role, text })),
            holdings: c.holdings,
            rate: c.rate,
            income: c.income,
            monthlyContribution: c.monthlyContribution,
            age: c.age,
            goals: c.goals,
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
          acc += delta
          if (assistantId === null) {
            assistantId = nextId()
            setThinking(false)
            setStreamingId(assistantId)
            commit([...messagesRef.current, { id: assistantId, role: 'assistant', text: acc }])
          } else {
            const id = assistantId
            commit(messagesRef.current.map((m) => (m.id === id ? { ...m, text: acc } : m)))
          }
        }
        if (assistantId === null) throw new Error('Empty response')

        // Stream done — split off any proposed changes and resolve them to
        // editable entities, exactly as the full Copilot page does.
        const { visible, tail } = splitProposals(acc)
        const items: StreamProposal[] = tail
          ? parseProposals(tail)
              .map((raw) =>
                resolveProposal(raw, {
                  holdings: c.holdings,
                  goals: c.goals,
                  categories: c.categories,
                  currentYear: new Date().getFullYear(),
                }),
              )
              .filter((ep): ep is EditableProposal => ep !== null)
              .map((ep) => ({ pid: nextId(), ep, status: 'pending' as ProposalStatus }))
          : []
        const id = assistantId
        commit(
          messagesRef.current.map((m) =>
            m.id === id ? { ...m, text: visible, proposals: items.length ? items : undefined } : m,
          ),
        )
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === 'AbortError'
        if (assistantId === null && !aborted) {
          commit([...messagesRef.current, { id: nextId(), role: 'assistant', text: ERROR_TEXT }])
        }
      } finally {
        setThinking(false)
        setStreamingId(null)
        abortRef.current = null
      }
    },
    [commit],
  )

  /** Mutate a single proposal card (edit its fields or change its status). */
  const patchProposal = useCallback(
    (messageId: string, pid: string, fn: (p: StreamProposal) => StreamProposal) => {
      commit(
        messagesRef.current.map((m) =>
          m.id === messageId
            ? { ...m, proposals: m.proposals?.map((p) => (p.pid === pid ? fn(p) : p)) }
            : m,
        ),
      )
    },
    [commit],
  )

  return {
    messages,
    thinking,
    streaming: streamingId !== null,
    generating,
    send,
    stop,
    reset,
    patchProposal,
  }
}
