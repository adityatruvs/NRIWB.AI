'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link'
import { Landmark, Building2, PencilLine, X, ChevronRight } from 'lucide-react'
import { buildLinkedAccounts, type LinkedAccount, type RawPlaidAccount } from '@/components/PlaidConnect'

interface Props {
  fxRate: number
  onLinked: (accounts: LinkedAccount[]) => void
  onManual: () => void
  onClose: () => void
}

export function AddAccountChooser({ fxRate, onLinked, onManual, onClose }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/plaid/create-link-token', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => setLinkToken(d.link_token))
      .catch(() => {})
  }, [])

  const onSuccess = useCallback(
    async (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
      const res = await fetch('/api/plaid/exchange-public-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      })
      const data = await res.json()
      const institutionName = metadata.institution?.name ?? 'Bank'
      onLinked(buildLinkedAccounts(data.accounts as RawPlaidAccount[], institutionName, fxRate))
      onClose()
    },
    [onLinked, fxRate, onClose],
  )

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess,
    onExit: (err) => {
      if (err) console.error('Plaid Link error:', err)
    },
  })

  const plaidReady = ready && !!linkToken

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card-surface relative w-full max-w-md animate-scale-in overflow-hidden"
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
          <h2 className="font-serif text-lg font-medium tracking-tight">Add an account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Link a bank automatically, or enter one by hand.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 px-5 pb-6 pt-3">
          {/* U.S. bank via Plaid */}
          <Option
            icon={<Landmark size={18} strokeWidth={1.75} />}
            accent="us"
            title="U.S. bank or brokerage"
            subtitle={plaidReady ? 'Connect instantly via Plaid' : 'Preparing secure connection…'}
            disabled={!plaidReady}
            onClick={() => open()}
          />

          {/* India bank — not yet available */}
          <Option
            icon={<Building2 size={18} strokeWidth={1.75} />}
            accent="india"
            title="Indian bank account"
            subtitle="Via Account Aggregator"
            badge="Coming soon"
            disabled
          />

          {/* Manual */}
          <Option
            icon={<PencilLine size={18} strokeWidth={1.75} />}
            accent="brand"
            title="Add manually"
            subtitle="Enter any account — US or India — by hand"
            onClick={() => {
              onManual()
              onClose()
            }}
          />
        </div>
      </div>
    </div>
  )
}

function Option({
  icon,
  title,
  subtitle,
  accent,
  badge,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  accent: 'us' | 'india' | 'brand'
  badge?: string
  disabled?: boolean
  onClick?: () => void
}) {
  const accentText =
    accent === 'us' ? 'text-us' : accent === 'india' ? 'text-india' : 'text-brand'
  const accentBg =
    accent === 'us' ? 'bg-us-muted/60' : accent === 'india' ? 'bg-india-muted/60' : 'bg-brand-muted/60'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-3.5 rounded-xl border border-border bg-card p-3.5 text-left transition-all enabled:hover:border-brand/40 enabled:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className={`flex size-10 items-center justify-center rounded-lg ${accentBg} ${accentText}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {badge && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {!disabled && (
        <ChevronRight
          size={16}
          className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
        />
      )}
    </button>
  )
}
