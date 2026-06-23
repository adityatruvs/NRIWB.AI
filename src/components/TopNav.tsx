'use client'

import Link from 'next/link'
import { Moon, Sun } from 'lucide-react'
import { useUser, UserButton } from '@clerk/nextjs'
import { useAccounts } from '@/context/AccountsContext'
import { useCurrency } from '@/context/CurrencyContext'
import { useTheme } from '@/context/ThemeContext'
import { complianceItems, type ComplianceLevel } from '@/lib/portfolio'
import CurrencyToggle from './CurrencyToggle'

const LEVEL_RANK: Record<ComplianceLevel, number> = { ok: 0, attention: 1, overdue: 2 }

const PILL = {
  ok: { dot: 'bg-success', text: 'text-success', label: 'All clear', bg: 'bg-success-muted/60', ring: 'ring-success/25' },
  attention: { dot: 'bg-warning', text: 'text-warning', label: 'Action needed', bg: 'bg-warning-muted/60', ring: 'ring-warning/25' },
  overdue: { dot: 'bg-danger', text: 'text-danger', label: 'Overdue', bg: 'bg-danger-muted/60', ring: 'ring-danger/25' },
}

export default function TopNav() {
  const { holdings } = useAccounts()
  const { rate } = useCurrency()
  const { theme, toggle } = useTheme()
  const { user } = useUser()
  const displayName = user?.fullName ?? user?.firstName ?? 'Your account'
  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  const worst = complianceItems(holdings, rate).reduce<ComplianceLevel>(
    (acc, it) => (LEVEL_RANK[it.level] > LEVEL_RANK[acc] ? it.level : acc),
    'ok',
  )
  const pill = PILL[worst]

  return (
    <header className="glass relative z-20 flex h-[60px] shrink-0 items-center justify-between border-b border-border/70 px-4 sm:px-6">
      {/* Tri-color brand hairline across the very top */}
      <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0 opacity-80" />

      {/* Brand */}
      <Link href="/" className="group flex items-center gap-2.5">
        <BrandMark />
        <div className="leading-none">
          <span className="text-[16px] font-semibold tracking-tight">
            <span className="text-gradient-brand">NRI</span>
            <span className="text-foreground">WB</span>
          </span>
          <span className="ml-2 hidden text-[13px] font-medium text-muted-foreground sm:inline">
            Wealth Builder
          </span>
        </div>
      </Link>

      {/* Right cluster */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <Link
          href="/"
          className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${pill.bg} ${pill.ring} transition-transform hover:scale-[1.03] sm:inline-flex`}
          title="Compliance status"
        >
          <span className={`relative flex size-1.5 ${worst !== 'ok' ? 'animate-pulse-ring' : ''} ${pill.text}`}>
            <span className={`size-1.5 rounded-full ${pill.dot}`} />
          </span>
          <span className={pill.text}>{pill.label}</span>
        </Link>

        <CurrencyToggle />

        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="btn-ghost flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <div className="ml-1 flex items-center gap-2.5">
          <div className="hidden leading-tight text-right sm:block">
            <p className="max-w-[140px] truncate text-xs font-semibold">{displayName}</p>
            {email && (
              <p className="max-w-[140px] truncate text-[11px] text-muted-foreground">{email}</p>
            )}
          </div>
          <UserButton appearance={{ elements: { avatarBox: 'size-8' } }} />
        </div>
      </div>
    </header>
  )
}

function BrandMark() {
  return (
    <span className="relative flex size-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-[var(--us)] via-[var(--brand)] to-[var(--india)] shadow-[0_2px_8px_-2px_color-mix(in_oklch,var(--brand)_55%,transparent)] transition-transform duration-200 group-hover:scale-105">
      <span className="absolute inset-0 rounded-[10px] shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]" />
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
        {/* a bridge / arc linking two markers — US ↔ India */}
        <circle cx="3.5" cy="13" r="1.6" fill="white" />
        <circle cx="14.5" cy="13" r="1.6" fill="white" />
        <path
          d="M3.5 12.5 C 5 5.5, 13 5.5, 14.5 12.5"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  )
}
