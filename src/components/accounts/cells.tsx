'use client'

/**
 * The editable cells of the Accounts sheet and the quick-entry review list:
 * a type picker, an amount input that reads "40L" / "1.2Cr" / "95k", and the
 * voice button. Missing values are tinted so a line that still needs something
 * stands out without an error message.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Mic, Square } from 'lucide-react'
import { typeChoiceLabel, type TypeChoice } from '@/lib/account-details'
import { formatAmountInput, parseAmountInput } from '@/lib/quick-entry'
import { cn } from '@/lib/utils'

export const cellCls =
  'h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-[14px] shadow-[inset_0_1px_2px_hsl(var(--shadow-color)/0.04)] outline-none transition-all placeholder:text-muted-foreground/60 focus:border-brand focus:ring-[3px] focus:ring-brand/12 disabled:cursor-not-allowed disabled:opacity-70'

/** A saved row's cell: reads as plain text until hovered or focused, like a spreadsheet. */
export const sheetCellCls =
  'border-transparent bg-transparent shadow-none hover:border-input hover:bg-card focus:bg-card'

/** A cell that still needs a value. */
export const missingCls = 'border-saffron/70 bg-warning-muted/45 focus:border-saffron'

export function TypeCell({
  id,
  value,
  options,
  onChange,
  label,
  placeholder = 'Choose type',
  disabled,
  className,
}: {
  id?: string
  value: TypeChoice | null
  options: TypeChoice[]
  onChange: (t: TypeChoice | null) => void
  label: string
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  return (
    // Top-aligned when a stacked row's balance cell is taller; centred again in the wide sheet.
    <div className="relative min-w-0 self-start @2xl:self-auto">
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as TypeChoice | null)}
        aria-label={label}
        disabled={disabled}
        className={cn(cellCls, 'cursor-pointer appearance-none pr-8', className, !value && missingCls)}
      >
        {!value && <option value="">{placeholder}</option>}
        {options.map((t) => (
          <option key={t} value={t}>
            {typeChoiceLabel(t)}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

/**
 * An amount in its own currency. Typing is free-form; the value commits on blur
 * or Enter, Escape puts back the last value. "40L", "1.2 Cr", "95k" all work.
 */
export function AmountCell({
  id,
  value,
  currency,
  onCommit,
  label,
  allowBlank = true,
  readOnly,
  title,
  className,
  inlineSymbol = false,
}: {
  id?: string
  value: number | null
  currency: 'USD' | 'INR'
  onCommit: (n: number | null) => void
  label: string
  /** The review list allows blank (tinted as missing); a saved account's balance can't be blank. */
  allowBlank?: boolean
  readOnly?: boolean
  title?: string
  className?: string
  /** Show the currency sign in the text ("₹45,00,000") instead of pinned at the left. */
  inlineSymbol?: boolean
}) {
  const sign = currency === 'USD' ? '$' : '₹'
  const show = (n: number | null) => {
    const t = formatAmountInput(n, currency)
    return inlineSymbol && t ? sign + t : t
  }
  const [text, setText] = useState(() => show(value))
  const [error, setError] = useState<string | null>(null)
  const focused = useRef(false)
  // Follow outside changes (an undo, a re-parse) unless the user is mid-edit.
  useEffect(() => {
    if (!focused.current) setText(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `show` only depends on these
  }, [value, currency, inlineSymbol])

  function commit() {
    const n = parseAmountInput(text)
    if (n != null && (Number.isNaN(n) || n < 0)) {
      setError('Use numbers, or 40L / 1.2Cr / 95k')
      return
    }
    if (n == null && !allowBlank) {
      setError('Enter an amount')
      return
    }
    setError(null)
    if (n === value) {
      setText(show(value))
      return
    }
    onCommit(n)
    setText(show(n))
  }

  const missing = allowBlank && (value == null || !(value > 0)) && !text.trim()
  return (
    <div className="min-w-0">
      <div className="relative">
        {!inlineSymbol && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted-foreground">
            {sign}
          </span>
        )}
        <input
          id={id}
          value={text}
          readOnly={readOnly}
          title={title}
          inputMode="decimal"
          aria-label={label}
          aria-invalid={!!error || undefined}
          placeholder={currency === 'USD' ? 'e.g. 95k' : 'e.g. 40L'}
          onFocus={() => {
            focused.current = true
          }}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError(null)
          }}
          onBlur={() => {
            focused.current = false
            if (!readOnly) commit()
          }}
          onKeyDown={(e) => {
            if (readOnly) return
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              setError(null)
              setText(show(value))
            }
          }}
          className={cn(
            cellCls,
            'text-right tabular-nums',
            !inlineSymbol && 'pl-7',
            missing && missingCls,
            error && 'border-danger focus:border-danger focus:ring-danger/12',
            className,
            readOnly && 'cursor-default bg-muted/40 focus:border-input focus:ring-0',
          )}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[11.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/* ── Voice ────────────────────────────────────────────────────────────────── */

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition
    webkitSpeechRecognition?: new () => Recognition
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Dictation into a text box, where the browser supports it (Chrome, Edge,
 * Safari). Hidden elsewhere — the phone keyboard's own mic still works.
 */
export function MicButton({
  value,
  onChange,
  onProblem,
}: {
  value: string
  onChange: (text: string) => void
  onProblem: (message: string | null) => void
}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  useEffect(() => {
    setSupported(!!recognitionCtor())
    return () => rec.current?.stop()
  }, [])
  if (!supported) return null

  function toggle() {
    if (rec.current) {
      rec.current.stop()
      return
    }
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const r = new Ctor()
    r.lang = 'en-IN'
    r.interimResults = true
    r.continuous = true
    const start = value ? value.replace(/\s*$/, ' ') : ''
    r.onresult = (e) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      onChange(start + t)
    }
    r.onerror = (e) => {
      onProblem(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone access is blocked. Allow it in your browser’s site settings, or type instead.'
          : e.error === 'no-speech'
            ? 'We didn’t hear anything. Try again, a little closer to the mic.'
            : 'Voice stopped working. Type instead, or try again.',
      )
    }
    r.onend = () => {
      rec.current = null
      setListening(false)
    }
    try {
      onProblem(null)
      r.start()
      rec.current = r
      setListening(true)
    } catch {
      onProblem('Voice stopped working. Type instead, or try again.')
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={listening}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-colors',
        listening
          ? 'border-danger/60 bg-danger-muted text-danger'
          : 'border-border bg-muted/60 text-foreground hover:border-brand/50',
      )}
    >
      {listening ? <Square size={12} className="animate-pulse fill-current" /> : <Mic size={15} />}
      {listening ? 'Listening… tap to stop' : 'Speak'}
    </button>
  )
}

/** The small IN / US chip on group headers. */
export function CountryChip({ country }: { country: 'US' | 'IN' }) {
  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider',
        country === 'IN' ? 'bg-india-muted text-india' : 'bg-us-muted text-us',
      )}
    >
      {country}
    </span>
  )
}
