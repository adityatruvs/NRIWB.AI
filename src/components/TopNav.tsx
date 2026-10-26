'use client'

import Link from 'next/link'
import { Moon, Sun, Trash2, UserCog } from 'lucide-react'
import { useClerk, useUser, UserButton } from '@clerk/nextjs'
import { useAccounts } from '@/context/AccountsContext'
import { useCurrency } from '@/context/CurrencyContext'
import { useTheme } from '@/context/ThemeContext'
import { complianceItems } from '@/lib/portfolio'
import { complianceSummary } from '@/lib/attention'
import { useFbarRecorded } from '@/hooks/useFbarRecorded'
import CurrencyToggle from './CurrencyToggle'

const PILL = {
  ok: { dot: 'bg-success', text: 'text-success', bg: 'bg-success-muted/60', ring: 'ring-success/25' },
  attention: { dot: 'bg-warning', text: 'text-warning', bg: 'bg-warning-muted/60', ring: 'ring-warning/25' },
  overdue: { dot: 'bg-danger', text: 'text-danger', bg: 'bg-danger-muted/60', ring: 'ring-danger/25' },
}

const PILL_CHECKING = { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground', bg: 'bg-muted/60', ring: 'ring-border' }

export default function TopNav() {
  const { holdings, loading: accountsLoading } = useAccounts()
  const { rate } = useCurrency()
  const { theme, toggle } = useTheme()
  const fbarRecorded = useFbarRecorded()
  const { user } = useUser()
  const { signOut } = useClerk()
  const displayName = user?.fullName ?? user?.firstName ?? 'Your account'
  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  // Permanently delete the account + all financial data (revokes Plaid, purges
  // our DB, deletes the Clerk identity). See app/api/user. Destructive + final.
  const handleDeleteAccount = async () => {
    const ok = window.confirm(
      'Delete your account?\n\n' +
        'This permanently erases all your accounts, balances, linked banks, and ' +
        'history, and revokes access to your connected banks. This cannot be undone.',
    )
    if (!ok) return
    try {
      const res = await fetch('/api/user', { method: 'DELETE' })
      if (!res.ok) throw new Error(`DELETE /api/user ${res.status}`)
      // The Clerk identity is gone — clear the stale session and return to landing.
      await signOut({ redirectUrl: '/' })
    } catch (e) {
      console.error('Failed to delete account:', e)
      window.alert('Something went wrong deleting your account. Please try again.')
    }
  }

  // Same items (and FBAR figure) as the dashboard, so the pill names what it lists.
  const status = complianceSummary(complianceItems(holdings, rate, fbarRecorded))
  // Until the accounts load there's nothing to judge: say so, never a premature "All clear".
  const worst = accountsLoading ? 'ok' : status.level
  const pill = accountsLoading ? PILL_CHECKING : PILL[worst]
  const pillLabel = accountsLoading ? 'Checking…' : status.label

  return (
    <header className="glass relative z-20 flex h-[60px] shrink-0 items-center justify-between border-b border-border/70 px-4 sm:px-6">
      {/* Tri-color brand hairline across the very top */}
      <span aria-hidden className="gradient-hairline absolute inset-x-0 top-0 opacity-80" />

      {/* Brand */}
      <Link href="/" className="group flex items-center gap-2.5">
        <BrandMark />
        <div className="leading-none">
          <span className="text-[16px] font-semibold tracking-tight">
            <span className="text-foreground">NRI</span>
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
          <span className={pill.text}>{pillLabel}</span>
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
          <UserButton appearance={{ elements: { avatarBox: 'size-8' } }}>
            <UserButton.MenuItems>
              <UserButton.Link
                label="Edit profile"
                labelIcon={<UserCog size={14} />}
                href="/profile"
              />
              <UserButton.Action
                label="Delete account & data"
                labelIcon={<Trash2 size={14} />}
                onClick={handleDeleteAccount}
              />
            </UserButton.MenuItems>
          </UserButton>
        </div>
      </div>
    </header>
  )
}

function BrandMark() {
  return (
    <span className="relative flex size-8 items-center justify-center rounded-[10px] bg-foreground text-background shadow-[0_2px_8px_-3px_hsl(var(--shadow-color)/0.4)] transition-transform duration-200 group-hover:scale-105">
      <span className="absolute inset-0 rounded-[10px] shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]" />
      <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
        {/* a bridge / arc linking two markers — US ↔ India */}
        <circle cx="3.5" cy="13" r="1.6" fill="currentColor" />
        <circle cx="14.5" cy="13" r="1.6" fill="currentColor" />
        <path
          d="M3.5 12.5 C 5 5.5, 13 5.5, 14.5 12.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  )
}
