'use client'

import { useRef, useState } from 'react'
import { UploadCloud, AlertTriangle, Loader2, X, Info } from 'lucide-react'
import { useAccounts } from '@/context/AccountsContext'
import { useCurrency } from '@/context/CurrencyContext'
import {
  ProposalCard,
  resolveProposal,
  accountToHolding,
  type AccountFields,
  type EditableProposal,
} from '@/components/copilot/ProposalCard'
import type { RawProposal } from '@/lib/copilot-actions'
import type { StatementProposal, StatementImportMeta, StatementSkipped } from '@/lib/statement-import'
import { buildImportKey, compareStatementDate, findMatch, type DateOutcome, type ImportAssetType } from '@/lib/import-key'
import type { SaveResult } from '@/context/AccountsContext'
import type { Holding, HoldingDetails } from '@/lib/portfolio'

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png'

interface ReviewItem {
  pid: string
  ep: EditableProposal
  meta: StatementImportMeta
  linkExisting: boolean
  status: 'pending' | 'applied' | 'discarded'
  saving?: boolean
  error?: string
}

type Stage =
  | { kind: 'upload' }
  | { kind: 'parsing'; fileName: string }
  | { kind: 'review'; items: ReviewItem[]; skipped: StatementSkipped; truncated: boolean }
  | { kind: 'error'; message: string }

interface Resolution {
  target?: Holding
  candidate?: Holding
  date?: string
  outcome: 'new' | DateOutcome
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function resolveItem(item: ReviewItem, holdings: Holding[], fallbackDate: string): Resolution {
  const match = findMatch(item.meta, holdings)
  const target = match.kind === 'match' ? match.holding : match.kind === 'confirm' && item.linkExisting ? match.holding : undefined
  const candidate = match.kind === 'confirm' ? match.holding : undefined
  const date = item.meta.statementDate ?? (fallbackDate || undefined)
  if (!target) return { candidate, date, outcome: 'new' }
  return { target, candidate, date, outcome: date ? compareStatementDate(date, target.details?.statementDate) : 'newer' }
}

function fmtMoney(h: Holding) {
  return h.country === 'IN' ? `₹${Math.round(h.balanceInr).toLocaleString('en-IN')}` : `$${Math.round(h.balanceUsd).toLocaleString('en-US')}`
}

function canAccept(r: Resolution) {
  return !!r.date && r.outcome !== 'same'
}

export function StatementImportPanel({ onClose, onManual }: { onClose: () => void; onManual: () => void }) {
  const { holdings, addManual, updateAccount } = useAccounts()
  const { rate } = useCurrency()
  const [stage, setStage] = useState<Stage>({ kind: 'upload' })
  const [fallbackDate, setFallbackDate] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStage({ kind: 'parsing', fileName: file.name })
    setFallbackDate('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/accounts/import-statement', { method: 'POST', body: form })
      const data = (await res.json().catch(() => ({}))) as {
        proposals?: StatementProposal[]
        skipped?: StatementSkipped
        truncated?: boolean
        error?: string
      }

      if (!res.ok) {
        setStage({ kind: 'error', message: data.error || 'Something went wrong reading that file.' })
        return
      }

      const items = (data.proposals ?? [])
        .map((p): ReviewItem | null => {
          const raw: RawProposal = { type: 'add_account', summary: p.summary, account: p.account }
          const ep = resolveProposal(raw, { holdings, goals: [], categories: [], currentYear: new Date().getFullYear(), rate })
          return ep ? { pid: crypto.randomUUID(), ep, meta: p.import, linkExisting: false, status: 'pending' } : null
        })
        .filter((x): x is ReviewItem => x !== null)

      if (items.length === 0) {
        setStage({ kind: 'error', message: 'No supported holdings were found in this statement.' })
        return
      }
      setStage({
        kind: 'review',
        items,
        skipped: data.skipped ?? { stocks: 0, unsupportedCurrency: 0, invalid: 0 },
        truncated: !!data.truncated,
      })
    } catch (e) {
      console.error('Statement upload failed:', e)
      setStage({ kind: 'error', message: 'Could not reach the server — check your connection and try again.' })
    }
  }

  function patchItem(pid: string, fn: (item: ReviewItem) => ReviewItem) {
    setStage((s) => (s.kind === 'review' ? { ...s, items: s.items.map((it) => (it.pid === pid ? fn(it) : it)) } : s))
  }

  async function apply(item: ReviewItem, r: Resolution) {
    if (item.ep.type !== 'add_account' || !r.date || item.saving) return
    const incoming = { ...accountToHolding(item.ep.account as AccountFields, rate), source: 'pdf_upload' as const }
    const { assetType, folio, accountRef, instrumentId } = item.meta
    const keyParts: HoldingDetails = {
      assetType,
      ...(folio ? { folio } : {}),
      ...(accountRef ? { accountRef } : {}),
      ...(instrumentId ? { instrumentId } : {}),
      statementDate: r.date,
    }
    patchItem(item.pid, (it) => ({ ...it, saving: true, error: undefined }))
    let result: SaveResult
    if (r.target?.id) {
      result = await updateAccount(
        r.target.id,
        {
          ...r.target,
          country: incoming.country,
          balanceUsd: incoming.balanceUsd,
          balanceInr: incoming.balanceInr,
          source: 'pdf_upload',
          details: { ...r.target.details, ...keyParts },
        },
        { confirmBalance: true, allowOlder: r.outcome === 'older' },
      )
    } else {
      result = await addManual({ ...incoming, details: { ...incoming.details, ...keyParts } })
    }
    patchItem(item.pid, (it) =>
      result.ok ? { ...it, saving: false, status: 'applied' } : { ...it, saving: false, error: result.error },
    )
  }

  async function acceptAll() {
    if (stage.kind !== 'review') return
    const seen = new Set<string>()
    for (const item of stage.items) {
      if (item.status !== 'pending') continue
      const r = resolveItem(item, holdings, fallbackDate)
      if (!canAccept(r) || r.outcome === 'older') continue
      const key = buildImportKey(item.meta)
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      await apply(item, r)
    }
  }

  const resolved = stage.kind === 'review' ? stage.items.map((item) => [item, resolveItem(item, holdings, fallbackDate)] as const) : []
  const bulkCount = resolved.filter(([i, r]) => i.status === 'pending' && canAccept(r) && r.outcome !== 'older').length
  const needsDate = stage.kind === 'review' && stage.items.some((i) => i.status === 'pending' && !i.meta.statementDate)
  const anyPfic = stage.kind === 'review' && stage.items.some((i) => i.ep.type === 'add_account' && i.ep.account.isPfic)

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
          <h2 className="font-serif text-lg font-medium tracking-tight">Import a statement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a custodian, brokerage, fund-registrar or bank statement from any country — we will read out
            your holdings for you to review. Re-uploading a statement updates what you already have.
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
                PDF, Word, Excel, CSV, or a photo of your statement — up to 10MB. Stocks are not imported yet.
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
                {bulkCount > 1 && (
                  <button onClick={acceptAll} className="btn-ghost shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium">
                    Accept all
                  </button>
                )}
              </div>

              {stage.truncated && (
                <p className="rounded-lg border border-warning/30 bg-warning-muted/40 px-3 py-2 text-[11px] leading-snug text-foreground">
                  <span className="font-semibold">This statement was too long to read completely</span> — some holdings at
                  the end may be missing. Upload the rest as a separate file or add them manually.
                </p>
              )}

              {(stage.skipped.stocks > 0 || stage.skipped.unsupportedCurrency > 0 || stage.skipped.invalid > 0) && (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                  Skipped{' '}
                  {[
                    stage.skipped.stocks > 0 && `${stage.skipped.stocks} stock row${stage.skipped.stocks === 1 ? '' : 's'} (not supported yet)`,
                    stage.skipped.unsupportedCurrency > 0 &&
                    `${stage.skipped.unsupportedCurrency} row${stage.skipped.unsupportedCurrency === 1 ? '' : 's'} in a currency other than USD or INR`,
                    stage.skipped.invalid > 0 &&
                    `${stage.skipped.invalid} row${stage.skipped.invalid === 1 ? '' : 's'} that couldn't be read or had no value`,
                  ]
                    .filter(Boolean)
                    .join(' and ')}
                  .
                </p>
              )}

              {needsDate && (
                <label className="flex flex-col gap-1.5 rounded-lg border border-warning/30 bg-warning-muted/40 px-3 py-2.5 text-[12px]">
                  <span className="font-medium text-foreground">What date are these balances as of?</span>
                  <span className="text-[11px] text-muted-foreground">
                    This file doesn&apos;t say. A statement date is required so an older upload never overwrites newer
                    balances.
                  </span>
                  <input
                    type="date"
                    max={todayIso()}
                    value={fallbackDate}
                    onChange={(e) => setFallbackDate(e.target.value)}
                    className="w-40 rounded-md border border-border bg-card px-2 py-1 text-[12px]"
                  />
                </label>
              )}

              {anyPfic && (
                <p className="rounded-lg bg-warning-muted/50 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                  India-domiciled mutual funds are PFICs for U.S. tax purposes — those holdings will be flagged as
                  such when saved (Form 8621 may apply).
                </p>
              )}

              {resolved.map(([item, r]) => (
                <ProposalCard
                  key={item.pid}
                  proposal={item.ep}
                  status={item.status}
                  onChange={(ep) => patchItem(item.pid, (it) => ({ ...it, ep }))}
                  onAccept={() => apply(item, r)}
                  onDiscard={() => patchItem(item.pid, (it) => ({ ...it, status: 'discarded' }))}
                  acceptDisabled={!canAccept(r) || !!item.saving}
                  acceptLabel={r.outcome === 'older' ? 'Update anyway' : r.target ? 'Update' : 'Accept'}
                  notice={
                    <>
                      <AssetTypeRow type={item.meta.assetType} />
                      {item.error && (
                        <p className="border-b border-border/60 bg-danger-muted/40 px-3 py-2 text-[11px] leading-snug text-danger">
                          Not saved — {item.error}
                        </p>
                      )}
                      <MatchNotice item={item} r={r} onLink={(linkExisting) => patchItem(item.pid, (it) => ({ ...it, linkExisting }))} />
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ASSET_TYPES: { type: ImportAssetType; label: string; blurb: string }[] = [
  {
    type: 'folio_fund',
    label: 'Folio fund',
    blurb: 'A fund held directly with a fund registrar under a folio number — e.g. Indian mutual funds (CAMS / KFintech). Matched by folio + ISIN.',
  },
  {
    type: 'custodial_security',
    label: 'Custodial security',
    blurb: 'A fund, ETF or bond held inside a brokerage or custody account — e.g. at Fidelity or Schwab. Matched by account number + ISIN.',
  },
  {
    type: 'deposit',
    label: 'Deposit',
    blurb: 'Money held at a bank — savings, checking, fixed deposits, NRE / NRO / FCNR. Matched by account number.',
  },
]

function AssetTypeRow({ type }: { type: ImportAssetType }) {
  const current = ASSET_TYPES.find((t) => t.type === type)
  return (
    <div className="group relative flex items-center gap-1.5 border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span>Holding type:</span>
      <span className="font-medium text-foreground">{current?.label ?? 'Other'}</span>
      <button
        type="button"
        aria-label="What do these holding types mean?"
        className="rounded-full text-muted-foreground transition hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
      >
        <Info size={13} />
      </button>
      <div
        role="tooltip"
        className="pointer-events-none invisible absolute inset-x-3 top-full z-20 mt-1 rounded-lg border border-border bg-card p-3 text-[11px] leading-snug text-muted-foreground opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide">How we sort holdings</p>
        <ul className="flex flex-col gap-2">
          {ASSET_TYPES.map((t) => (
            <li key={t.type} className={t.type === type ? 'text-foreground' : undefined}>
              <span className="font-semibold">{t.label}</span> — {t.blurb}
            </li>
          ))}
        </ul>
        <p className="mt-2">We use this to recognise the same holding when you upload a statement again.</p>
      </div>
    </div>
  )
}

function MatchNotice({ item, r, onLink }: { item: ReviewItem; r: Resolution; onLink: (link: boolean) => void }) {
  const tone = 'border-b border-border/60 px-3 py-2 text-[11px] leading-snug'
  if (r.target && r.outcome === 'same') {
    return (
      <p className={`${tone} bg-muted/40 text-muted-foreground`}>
        Already up to date — <span className="font-medium text-foreground">{r.target.nickname}</span> is already
        imported from the {r.date} statement.
      </p>
    )
  }
  if (r.target && r.outcome === 'older') {
    return (
      <p className={`${tone} bg-warning-muted/50 text-foreground`}>
        <span className="font-semibold">Older statement.</span> {r.target.nickname} was last updated from a{' '}
        {r.target.details?.statementDate} statement; this one is from {r.date}. Updating would roll its balance back
        to {r.date}.
      </p>
    )
  }
  if (r.target) {
    return (
      <p className={`${tone} bg-brand-muted/30 text-muted-foreground`}>
        <span className="font-medium text-foreground">Updates existing:</span> {r.target.nickname} (now{' '}
        {fmtMoney(r.target)}
        {r.target.details?.statementDate ? ` as of ${r.target.details.statementDate}` : ''}).
      </p>
    )
  }
  if (r.candidate) {
    return (
      <label className={`${tone} flex cursor-pointer items-start gap-2 bg-warning-muted/40 text-muted-foreground`}>
        <input
          type="checkbox"
          checked={item.linkExisting}
          onChange={(e) => onLink(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium text-foreground">Possible match:</span> {r.candidate.nickname} (
          {fmtMoney(r.candidate)}). Tick to update that holding instead of adding a new one.
        </span>
      </label>
    )
  }
  if (!item.meta.folio && !item.meta.accountRef) {
    return (
      <p className={`${tone} bg-muted/40 text-muted-foreground`}>
        No folio or account number found, so re-uploads can&apos;t be matched to this holding automatically.
      </p>
    )
  }
  return null
}
