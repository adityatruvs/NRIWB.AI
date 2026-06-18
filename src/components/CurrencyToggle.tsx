'use client'

import { useState, useRef } from 'react'
import { Check } from 'lucide-react'
import { useCurrency } from '@/context/CurrencyContext'
import type { CurrencyMode } from '@/types/accounts'
import { cn } from '@/lib/utils'

const TRIGGER_LABELS: Record<CurrencyMode, string> = {
  usd: 'USD',
  inr: 'INR',
  inr_lakhs: '₹ L / Cr',
}

interface DropdownOption {
  mode: CurrencyMode
  label: string
  sublabel: string
}

const INR_OPTIONS: DropdownOption[] = [
  { mode: 'inr', label: 'Normal', sublabel: '₹1,23,456' },
  { mode: 'inr_lakhs', label: 'Lakhs / Crore', sublabel: '₹1.2L · ₹1.2Cr' },
]

export default function CurrencyToggle() {
  const { mode, setMode } = useCurrency()
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }

  function onLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  function select(m: CurrencyMode) {
    setMode(m)
    setOpen(false)
  }

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button className="btn-ghost flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        {TRIGGER_LABELS[mode]}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={cn('opacity-50 transition-transform duration-150', open && 'rotate-180')}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="animate-dropdown-in absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-[0_4px_12px_-2px_hsl(var(--shadow-color)/0.12),0_16px_40px_-12px_hsl(var(--shadow-color)/0.2)]">

          {/* USD */}
          <button
            onClick={() => select('usd')}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent',
              mode === 'usd' && 'bg-accent/70',
            )}
          >
            <span className="font-medium">USD</span>
            <span className="ml-auto text-xs text-muted-foreground">US Dollar</span>
            {mode === 'usd' && <Check size={13} className="text-brand" />}
          </button>

          <div className="border-t border-border/70" />

          {/* INR group */}
          <p className="eyebrow px-3 pb-1 pt-2 !text-[10px]">INR</p>

          {INR_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => select(opt.mode)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                mode === opt.mode && 'bg-accent/70',
              )}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{opt.sublabel}</span>
              {mode === opt.mode && <Check size={13} className="text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
