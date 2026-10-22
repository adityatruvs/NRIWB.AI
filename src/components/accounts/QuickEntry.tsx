'use client'

/**
 * Add accounts in one go. The user says or types what they have; NRIWB AI turns
 * it into one line per account; they check every line on one screen (nothing is
 * guessed — a missing type or amount is tinted for them to fill); and nothing is
 * saved until every line has a type and an amount.
 */

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Link2, Plus, Sparkles, X } from 'lucide-react'
import { useCurrency } from '@/context/CurrencyContext'
import { formatAmount, formatLakhs, formatUSD } from '@/lib/currency'
import { typeChoiceLabel, typeChoicesFor, type TypeChoice } from '@/lib/account-details'
import {
  LINE_GROUPS,
  blankLine,
  lineMissing,
  lineToHolding,
  missingCounts,
  newLineId,
  placeLine,
  readyToSave,
  retypeLine,
  type DraftLine,
  type LineGroup,
} from '@/lib/quick-entry'
import type { Holding } from '@/lib/portfolio'
import { AmountCell, CountryChip, MicButton, TypeCell, cellCls, missingCls } from '@/components/accounts/cells'
import { cn } from '@/lib/utils'

const EXAMPLES = [
  {
    title: 'Everyday banking',
    text: 'NRE savings at ICICI 10 lakh, NRO savings at SBI 2 lakh. In the US, Chase checking $5k, Ally savings $20k and an Amex card with $2k due.',
  },
  {
    title: 'Fixed deposits',
    text: 'Two NRE fixed deposits at Axis of 5 lakh each at 7%, an FCNR deposit at ICICI of $25k and PPF 6 lakh.',
  },
  {
    title: 'Home in India',
    text: 'Flat in Hyderabad worth 1.2 crore with a home loan of 80 lakh at HDFC, EMI 70k at 8.5%.',
  },
  { title: 'US retirement', text: '401k at Fidelity $60k, Vanguard IRA $50k and a Roth IRA $20k.' },
]

const WHERE_OPTIONS = LINE_GROUPS.map((g) => ({ key: g.key, label: g.label }))

export function QuickEntry({
  rate,
  onSave,
  onDone,
  onMoreWays,
  onDirtyChange,
}: {
  rate: number
  /** Saves each holding; resolves per holding to the saved row or null on failure. */
  onSave: (holdings: Holding[]) => Promise<(Holding | null)[]>
  /** Everything on the list was saved. */
  onDone: (saved: Holding[]) => void
  /** Link a bank, upload a CAS statement, or fill in every detail by hand. */
  onMoreWays: () => void
  /** How many unsaved lines there are, so leaving can ask first. */
  onDirtyChange: (count: number) => void
}) {
  const { mode } = useCurrency()
  const [step, setStep] = useState<'tell' | 'review'>('tell')
  const [said, setSaid] = useState('')
  const [heard, setHeard] = useState<string[]>([])
  const [lines, setLines] = useState<DraftLine[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  const [removed, setRemoved] = useState<{ line: DraftLine; index: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => onDirtyChange(lines.length), [lines.length, onDirtyChange])
  useEffect(() => {
    if (fresh.size === 0) return
    const t = setTimeout(() => setFresh(new Set()), 2400)
    return () => clearTimeout(t)
  }, [fresh])
  useEffect(() => {
    if (!removed) return
    const t = setTimeout(() => setRemoved(null), 6000)
    return () => clearTimeout(t)
  }, [removed])

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  async function listAccounts() {
    const text = said.trim()
    if (!text) {
      setStatus({ text: 'Tell us at least one account, for example “two accounts at HDFC”.', error: true })
      return
    }
    setBusy(true)
    setStatus({ text: 'Listing your accounts…' })
    try {
      const res = await fetch('/api/accounts/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = (await res.json().catch(() => ({}))) as { lines?: DraftLine[]; error?: string }
      if (!res.ok || !Array.isArray(data.lines)) {
        setStatus({ text: data.error ?? 'NRIWB AI couldn’t read that just now. Try again in a moment.', error: true })
        return
      }
      if (data.lines.length === 0) {
        setStatus({
          text: 'We couldn’t find any accounts in that. Name the bank or what it is, like “HDFC NRE account” or “Schwab brokerage”.',
          error: true,
        })
        return
      }
      // Fresh ids here, so lines from the server never collide with tile-added ones.
      const added = data.lines.map((l) => ({ ...l, id: newLineId() }))
      setLines((prev) => [...prev, ...added])
      setHeard((prev) => [...prev, text])
      setFresh(new Set(added.map((l) => l.id)))
      setSaid('')
      setStatus(null)
      setStep('review')
      toTop()
    } catch {
      setStatus({ text: 'Couldn’t reach NRIWB AI. Check your connection and try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  const patch = (id: string, f: (l: DraftLine) => DraftLine) =>
    setLines((prev) => prev.map((l) => (l.id === id ? f(l) : l)))

  function remove(l: DraftLine) {
    const index = lines.findIndex((x) => x.id === l.id)
    setLines((prev) => prev.filter((x) => x.id !== l.id))
    setRemoved({ line: l, index })
  }

  function undoRemove() {
    if (!removed) return
    const { line, index } = removed
    setLines((prev) => [...prev.slice(0, index), line, ...prev.slice(index)])
    setRemoved(null)
  }

  function addTile(g: LineGroup, t: TypeChoice) {
    const l = blankLine(g.country, g.kind, t, typeChoiceLabel(t))
    setLines((prev) => [...prev, l])
    setFresh(new Set([l.id]))
    setTimeout(() => document.getElementById(`qa-${l.id}`)?.focus(), 40)
  }

  async function save() {
    if (!readyToSave(lines) || saving) return
    setSaving(true)
    setSaveError(null)
    const results = await onSave(lines.map((l) => lineToHolding(l, rate)))
    setSaving(false)
    const failed = lines.filter((_, i) => !results[i])
    const saved = results.filter((h): h is Holding => !!h)
    if (failed.length === 0) {
      setLines([])
      onDone(saved)
      return
    }
    // Keep what didn't save on the list so nothing typed is lost.
    setLines(failed)
    setSaveError(
      `${saved.length ? `Saved ${saved.length}. ` : ''}${failed.length} account${failed.length === 1 ? '' : 's'} couldn’t be saved and ${failed.length === 1 ? 'is' : 'are'} still below. Try again.`,
    )
  }

  if (step === 'tell') {
    return (
      <TellStep
        said={said}
        setSaid={setSaid}
        busy={busy}
        status={status}
        voiceNote={voiceNote}
        setVoiceNote={setVoiceNote}
        draftCount={lines.length}
        onList={listAccounts}
        onBackToList={() => {
          setStep('review')
          toTop()
        }}
        onChecklist={() => {
          setStep('review')
          toTop()
        }}
        onMoreWays={onMoreWays}
      />
    )
  }

  const unknown = lines.filter((l) => !l.country)
  const counts = missingCounts(lines)
  const ready = readyToSave(lines)
  const netUsd = lines.reduce((s, l) => {
    if (l.amount == null || !l.country) return s
    const usd = l.currency === 'USD' ? l.amount : l.amount / rate
    return s + (l.kind === 'liability' ? -usd : usd)
  }, 0)
  const heardText = heard.join(' · ')

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-[1.45rem] font-medium tracking-tight">
            {heard.length ? 'Here’s what we heard' : 'Pick what you have'}
          </h2>
          <p className="mt-1 max-w-[70ch] text-[13.5px] leading-relaxed text-muted-foreground">
            {heardText ? (
              <>
                From <q className="italic text-foreground">{heardText.length > 220 ? `${heardText.slice(0, 220)}…` : heardText}</q>.
                Check each line, then add anything we missed.
              </>
            ) : (
              'Tap what you have below. Each tap adds a line; then type the amounts.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep('tell')}
          className="btn-ghost inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3.5 py-2 text-[13px] font-medium"
        >
          <ArrowLeft size={14} />
          Tell us more
        </button>
      </div>

      <section aria-label="Your accounts" className="card-surface @container overflow-hidden p-0">
        {unknown.length > 0 && (
          <div>
            <div className="flex items-center gap-2.5 bg-muted/50 px-4 py-3 text-[13.5px] font-semibold">
              Not sure where these go
              <span className="rounded-full bg-warning-muted px-2 py-0.5 text-[11px] font-semibold text-warning">
                Choose India or US
              </span>
            </div>
            {unknown.map((l) => (
              <LineRow
                key={l.id}
                line={l}
                fresh={fresh.has(l.id)}
                onPatch={(f) => patch(l.id, f)}
                onRemove={() => remove(l)}
              />
            ))}
          </div>
        )}
        {LINE_GROUPS.map((g) => {
          const rows = lines.filter((l) => l.country === g.country && l.kind === g.kind)
          if (rows.length === 0) return null
          const cur = g.country === 'IN' ? 'INR' : 'USD'
          const total = rows.reduce((s, l) => {
            if (l.amount == null) return s
            if (l.currency === cur) return s + l.amount
            return s + (cur === 'INR' ? l.amount * rate : l.amount / rate)
          }, 0)
          return (
            <div key={g.key} className="border-t border-border/50 first:border-t-0">
              <div className="flex items-center gap-2.5 bg-muted/50 px-4 py-3 text-[13.5px] font-semibold">
                <CountryChip country={g.country} />
                {g.label}
                <span className="text-[12px] font-medium text-muted-foreground">
                  {rows.length} account{rows.length === 1 ? '' : 's'}
                </span>
                <span className="ml-auto font-medium tabular-nums text-muted-foreground">
                  {g.kind === 'liability' && total > 0 ? '−' : ''}
                  {cur === 'INR' ? formatLakhs(total) : formatUSD(total)}
                </span>
              </div>
              {rows.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  fresh={fresh.has(l.id)}
                  onPatch={(f) => patch(l.id, f)}
                  onRemove={() => remove(l)}
                />
              ))}
            </div>
          )
        })}
        {lines.length === 0 && (
          <p className="px-4 py-5 text-[13px] text-muted-foreground">
            No accounts on the list yet. Tap what you have below, or tell us.
          </p>
        )}
      </section>

      <AnythingElse lines={lines} onAdd={addTile} />

      {saveError && (
        <p role="alert" className="rounded-xl bg-danger-muted/60 px-4 py-3 text-[13px] text-danger ring-1 ring-danger/20">
          {saveError}
        </p>
      )}

      {/* Save bar — stays in view while the list scrolls */}
      {/* Right margin keeps the button clear of the floating Copilot button. */}
      <div className="sticky bottom-3 z-20 mr-16 flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/95 px-4 py-3 shadow-[0_12px_28px_-10px_hsl(var(--shadow-color)/0.25)] backdrop-blur-md">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
            <span>
              <b className="tabular-nums">{lines.length}</b> account{lines.length === 1 ? '' : 's'}
            </span>
            {counts.type > 0 && <NeedPill>{counts.type} need{counts.type === 1 ? 's' : ''} a type</NeedPill>}
            {counts.amount > 0 && <NeedPill>{counts.amount} need{counts.amount === 1 ? 's' : ''} an amount</NeedPill>}
            {ready && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 text-[11.5px] font-semibold text-success">
                <Check size={11} />
                Ready to save
              </span>
            )}
            {lines.length > 0 && (
              <span className="text-[12.5px] text-muted-foreground">
                Net worth of this list{' '}
                <span className="font-semibold tabular-nums text-foreground">{formatAmount(netUsd, mode, rate)}</span>
              </span>
            )}
          </div>
          {!ready && lines.length > 0 && (
            <p className="mt-1 hidden text-[12px] text-muted-foreground sm:block">
              Nothing is saved until every line has a type and an amount.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!ready || saving}
          className="btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold disabled:pointer-events-none disabled:opacity-45"
        >
          {saving
            ? 'Saving…'
            : ready
              ? `Save ${lines.length} account${lines.length === 1 ? '' : 's'}`
              : 'Save accounts'}
        </button>
      </div>

      {removed && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl bg-foreground px-4 py-2.5 text-[13px] text-background shadow-lg animate-fade-in"
        >
          <span className="truncate">Removed {removed.line.name || 'account'}.</span>
          <button type="button" onClick={undoRemove} className="font-semibold underline underline-offset-2">
            Undo
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => setRemoved(null)} className="opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

function NeedPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-warning-muted px-2 py-0.5 text-[11.5px] font-semibold text-warning">{children}</span>
  )
}

/* ── Step 1: tell us ──────────────────────────────────────────────────────── */

function TellStep({
  said,
  setSaid,
  busy,
  status,
  voiceNote,
  setVoiceNote,
  draftCount,
  onList,
  onBackToList,
  onChecklist,
  onMoreWays,
}: {
  said: string
  setSaid: (s: string) => void
  busy: boolean
  status: { text: string; error?: boolean } | null
  voiceNote: string | null
  setVoiceNote: (s: string | null) => void
  draftCount: number
  onList: () => void
  onBackToList: () => void
  onChecklist: () => void
  onMoreWays: () => void
}) {
  return (
    <section aria-labelledby="qe-ask" className="ai-ring flex flex-col gap-4 p-5 sm:p-7 animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="ai-chip flex size-9 shrink-0 items-center justify-center rounded-xl">
          <Sparkles size={17} className="text-white" />
        </span>
        <div>
          <h2 id="qe-ask" className="font-serif text-[1.35rem] font-medium leading-snug tracking-tight">
            What accounts do you have in India and the US?
          </h2>
          <p className="mt-0.5 text-[14.5px] text-muted-foreground">
            Name your banks and what you hold. Amounts are optional. We list each account for you to check.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border-[1.5px] border-border bg-card transition-colors focus-within:border-brand">
        <textarea
          value={said}
          onChange={(e) => setSaid(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy) onList()
          }}
          aria-label="Describe your accounts"
          placeholder="e.g. Two accounts at HDFC, an NRE fixed deposit at Axis for 5 lakh, and a flat in Hyderabad. In the US, Chase checking and my 401k at Fidelity."
          maxLength={4000}
          className="block min-h-[120px] w-full resize-y rounded-2xl bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
        <div className="flex flex-wrap items-center gap-2 px-2.5 pb-2.5 pt-1">
          <MicButton value={said} onChange={setSaid} onProblem={setVoiceNote} />
          <button
            type="button"
            onClick={onList}
            disabled={busy}
            className="btn-primary ml-auto inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold disabled:opacity-60"
          >
            {busy ? (
              'Listing your accounts…'
            ) : draftCount ? (
              <>
                <Plus size={14} />
                Add to my list
              </>
            ) : (
              'List my accounts'
            )}
          </button>
        </div>
      </div>

      {voiceNote && (
        <p className="rounded-xl bg-warning-muted/70 px-3 py-2 text-[12.5px] text-warning">{voiceNote}</p>
      )}
      <p
        aria-live="polite"
        className={cn('min-h-[1.25rem] text-[13px]', status?.error ? 'text-danger' : 'text-muted-foreground')}
      >
        {status?.text}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-muted-foreground">Or try an example:</span>
        {EXAMPLES.map((x) => (
          <button
            key={x.title}
            type="button"
            title={x.text}
            onClick={() => setSaid(x.text)}
            className="rounded-full border border-dashed border-border px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-brand/60 hover:text-foreground"
          >
            {x.title}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-4 text-[13px]">
        {draftCount > 0 ? (
          <>
            <button
              type="button"
              onClick={onBackToList}
              className="btn-ghost inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3.5 py-2 font-medium"
            >
              Back to my list ({draftCount})
            </button>
            <span className="text-[12.5px] text-muted-foreground">
              Anything new you tell us is added to your list. Nothing you already checked is lost.
            </span>
          </>
        ) : (
          <button type="button" onClick={onChecklist} className="font-semibold text-brand underline underline-offset-2">
            Skip and pick from a checklist instead
          </button>
        )}
        <button
          type="button"
          onClick={onMoreWays}
          className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Link2 size={13} />
          Link a bank, import a CAS statement, or add one with every detail
        </button>
      </div>
    </section>
  )
}

/* ── One line on the review list ──────────────────────────────────────────── */

function LineRow({
  line: l,
  fresh,
  onPatch,
  onRemove,
}: {
  line: DraftLine
  fresh: boolean
  onPatch: (f: (l: DraftLine) => DraftLine) => void
  onRemove: () => void
}) {
  const missing = lineMissing(l)
  const options = useMemo(() => (l.country ? typeChoicesFor(l.country, l.kind) : []), [l.country, l.kind])
  const quick: TypeChoice[] | null =
    !l.type && l.country === 'IN' && l.kind === 'asset' && l.hint
      ? l.hint === 'fd'
        ? ['fd_nre', 'fd_nro']
        : ['nre', 'nro']
      : null
  return (
    <div
      data-line={l.id}
      title={l.said ? `From: “${l.said}”` : undefined}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_2.25rem] gap-x-2.5 gap-y-2 border-t border-border/40 px-4 py-3 transition-colors duration-700 @xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1fr)_2.25rem] @xl:items-start',
        fresh && 'bg-brand/[0.07]',
      )}
    >
      <Field label="Name" htmlFor={`qn-${l.id}`}>
        <input
          id={`qn-${l.id}`}
          value={l.name}
          maxLength={60}
          onChange={(e) => onPatch((x) => ({ ...x, name: e.target.value }))}
          className={cellCls}
        />
      </Field>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${l.name || 'account'}`}
        className="mt-[1.4rem] flex size-9 items-center justify-center self-start rounded-lg text-muted-foreground transition-colors hover:bg-danger-muted hover:text-danger @xl:order-last"
      >
        <X size={16} />
      </button>
      <div className="col-span-2 grid grid-cols-2 gap-2.5 @xl:contents">
        {l.country ? (
          <Field label="Type" htmlFor={`qt-${l.id}`}>
            <TypeCell
              id={`qt-${l.id}`}
              value={l.type}
              options={options}
              label="Account type"
              onChange={(t) => onPatch((x) => retypeLine(x, t))}
            />
            {quick && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {quick.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onPatch((x) => retypeLine(x, t))}
                    className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[12px] transition-colors hover:border-brand/60"
                  >
                    {typeChoiceLabel(t)}
                  </button>
                ))}
              </div>
            )}
          </Field>
        ) : (
          <Field label="Where" htmlFor={`qw-${l.id}`}>
            <div className="relative">
              <select
                id={`qw-${l.id}`}
                value=""
                aria-label="Where is this account"
                onChange={(e) => {
                  const g = LINE_GROUPS.find((x) => x.key === e.target.value)
                  if (g) onPatch((x) => placeLine(x, g.country, g.kind))
                }}
                className={cn(cellCls, 'cursor-pointer appearance-none', missingCls)}
              >
                <option value="">Where is this?</option>
                {WHERE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        )}
        <Field label={l.kind === 'liability' ? 'Amount owed' : 'Balance / value'} htmlFor={`qa-${l.id}`}>
          <AmountCell
            id={`qa-${l.id}`}
            value={l.amount}
            currency={l.currency}
            label={l.kind === 'liability' ? 'Amount owed' : 'Balance'}
            onCommit={(n) => onPatch((x) => ({ ...x, amount: n }))}
          />
        </Field>
      </div>
      {missing.length > 0 && <span className="sr-only">Needs {missing.join(' and ')}</span>}
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

/* ── Anything else? ───────────────────────────────────────────────────────── */

function AnythingElse({ lines, onAdd }: { lines: DraftLine[]; onAdd: (g: LineGroup, t: TypeChoice) => void }) {
  const counts = new Map<string, number>()
  for (const l of lines) {
    if (!l.country || !l.type) continue
    const k = `${l.country}:${l.kind}|${l.type}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return (
    <section aria-labelledby="qe-else" className="card-surface @container flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="qe-else" className="font-serif text-[1.15rem] font-medium tracking-tight">
          {lines.length ? 'Anything else?' : 'What do you have?'}
        </h2>
        <span className="text-[12.5px] text-muted-foreground">
          {lines.length
            ? 'People often forget property, retirement accounts and loans. Tap to add a line.'
            : 'Tap each account you hold. Dashed tiles are the ones people most often forget.'}
        </span>
      </div>
      <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-4">
        {LINE_GROUPS.map((g) => (
          <div key={g.key}>
            <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold">
              <CountryChip country={g.country} />
              {g.label}
            </h3>
            <div className="grid grid-cols-2 gap-1.5 @lg:grid-cols-1">
              {g.tiles.map((t) => {
                const c = counts.get(`${g.key}|${t}`) ?? 0
                const forgotten = c === 0 && g.forgotten.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onAdd(g, t)}
                    aria-label={`Add ${typeChoiceLabel(t)} to ${g.label}${c ? ` (${c} already)` : ''}`}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-[13px] transition-colors hover:border-brand/60',
                      forgotten && 'border-dashed',
                    )}
                  >
                    <span className="truncate">{typeChoiceLabel(t)}</span>
                    {c ? (
                      <span className="rounded-full bg-success-muted px-1.5 text-[11px] font-bold text-success">{c}</span>
                    ) : (
                      <Plus size={13} className="shrink-0 text-brand" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
