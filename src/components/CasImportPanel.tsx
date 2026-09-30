'use client'

import { useRef, useState } from 'react'
import { UploadCloud, AlertTriangle, Loader2, X } from 'lucide-react'
import { useAccounts } from '@/context/AccountsContext'
import {
  ProposalCard,
  resolveProposal,
  accountToHolding,
  type AccountFields,
  type EditableProposal,
} from '@/components/copilot/ProposalCard'
import type { RawProposal } from '@/lib/copilot-actions'
import type { CasProposal } from '@/lib/cas-import'

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png'

interface ReviewItem {
  pid: string
  ep: EditableProposal
  status: 'pending' | 'applied' | 'discarded'
}

type Stage =
  | { kind: 'upload' }
  | { kind: 'parsing'; fileName: string }
  | { kind: 'review'; items: ReviewItem[] }
  | { kind: 'error'; message: string }

export function CasImportPanel({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const { holdings, addManual } = useAccounts()
  const [stage, setStage] = useState<Stage>({ kind: 'upload' })
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStage({ kind: 'parsing', fileName: file.name })
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/accounts/import-cas', { method: 'POST', body: form })
      const data = (await res.json().catch(() => ({}))) as { proposals?: CasProposal[]; error?: string }

      if (!res.ok) {
        setStage({ kind: 'error', message: data.error || 'Something went wrong reading that file.' })
        return
      }

      const items = (data.proposals ?? [])
        .map((p): ReviewItem | null => {
          const raw: RawProposal = { type: 'add_account', summary: p.summary, account: p.account }
          const ep = resolveProposal(raw, { holdings, goals: [], categories: [], currentYear: new Date().getFullYear() })
          return ep ? { pid: crypto.randomUUID(), ep, status: 'pending' } : null
        })
        .filter((x): x is ReviewItem => x !== null)

      if (items.length === 0) {
        setStage({ kind: 'error', message: 'No mutual fund holdings were found in this statement.' })
        return
      }
      setStage({ kind: 'review', items })
    } catch (e) {
      console.error('CAS upload failed:', e)
      setStage({ kind: 'error', message: 'Could not reach the server — check your connection and try again.' })
    }
  }

  function patchItem(pid: string, fn: (item: ReviewItem) => ReviewItem) {
    setStage((s) => (s.kind === 'review' ? { ...s, items: s.items.map((it) => (it.pid === pid ? fn(it) : it)) } : s))
  }

  function toImportedHolding(account: AccountFields) {
    return { ...accountToHolding(account), source: 'pdf_upload' as const }
  }

  function accept(item: ReviewItem) {
    if (item.ep.type !== 'add_account') return
    addManual(toImportedHolding(item.ep.account))
    patchItem(item.pid, (it) => ({ ...it, status: 'applied' }))
  }

  function acceptAll() {
    if (stage.kind !== 'review') return
    for (const item of stage.items) {
      if (item.status === 'pending' && item.ep.type === 'add_account') addManual(toImportedHolding(item.ep.account))
    }
    setStage((s) =>
      s.kind === 'review' ? { ...s, items: s.items.map((it) => (it.status === 'pending' ? { ...it, status: 'applied' } : it)) } : s,
    )
  }

  const pendingCount = stage.kind === 'review' ? stage.items.filter((i) => i.status === 'pending').length : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card-surface relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>

        <div className="px-7 pb-2 pt-8">
          <h2 className="font-serif text-lg font-medium tracking-tight">Import a CAS statement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your CAMS or KFintech Consolidated Account Statement — we&apos;ll read out your mutual fund
            holdings for you to review.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-3">
          {stage.kind === 'upload' && (
            <div
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f) void handleFile(f)
              }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-10 text-center transition hover:border-brand/40 hover:bg-brand-muted/20"
            >
              <UploadCloud size={28} strokeWidth={1.5} className="text-brand" />
              <p className="text-sm font-medium">Drop your statement here, or click to browse</p>
              <p className="text-xs text-muted-foreground">
                PDF, Word, Excel, CSV, or a photo of your statement — up to 10MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                }}
                className="hidden"
              />
            </div>
          )}

          {stage.kind === 'parsing' && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 size={26} className="animate-spin text-brand" />
              <p className="text-sm font-medium">Reading {stage.fileName}…</p>
              <p className="text-xs text-muted-foreground">This can take up to a minute for longer statements.</p>
            </div>
          )}

          {stage.kind === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-danger-muted/60 text-danger">
                <AlertTriangle size={18} />
              </span>
              <p className="text-sm font-medium">{stage.message}</p>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => setStage({ kind: 'upload' })}
                  className="btn-ghost rounded-lg px-3 py-1.5 text-[13px] font-medium"
                >
                  Try another file
                </button>
                <button
                  onClick={() => {
                    onManual()
                    onClose()
                  }}
                  className="btn-primary rounded-lg px-3 py-1.5 text-[13px] font-medium"
                >
                  Add manually
                </button>
              </div>
            </div>
          )}

          {stage.kind === 'review' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Found {stage.items.length} holding{stage.items.length === 1 ? '' : 's'} — review each before saving.
                </p>
                {pendingCount > 1 && (
                  <button onClick={acceptAll} className="btn-ghost shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium">
                    Accept all
                  </button>
                )}
              </div>
              <p className="rounded-lg bg-warning-muted/50 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                India-domiciled mutual funds are PFICs for U.S. tax purposes — every holding below will be flagged
                as one when saved (Form 8621 may apply).
              </p>
              {stage.items.map((item) => (
                <ProposalCard
                  key={item.pid}
                  proposal={item.ep}
                  status={item.status}
                  onChange={(ep) => patchItem(item.pid, (it) => ({ ...it, ep }))}
                  onAccept={() => accept(item)}
                  onDiscard={() => patchItem(item.pid, (it) => ({ ...it, status: 'discarded' }))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
