'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link'
import type { Holding } from '@/lib/portfolio'

interface Props {
  /** Called with the accounts the server just persisted (already-real Holdings). */
  onLinked: (accounts: Holding[]) => void
  fxRate: number
}

export function PlaidConnect({ onLinked, fxRate }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/plaid/create-link-token', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => setLinkToken(d.link_token))
  }, [])

  const onSuccess = useCallback(
    async (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
      const institutionName = metadata.institution?.name ?? 'Bank'
      const res = await fetch('/api/plaid/exchange-public-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token, institutionName, rate: fxRate }),
      })
      const data = await res.json()
      if (Array.isArray(data.accounts)) onLinked(data.accounts as Holding[])
    },
    [onLinked, fxRate],
  )

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess,
    onExit: (err) => {
      if (err) console.error('Plaid Link error:', err)
    },
  })

  return (
    <button
      onClick={() => open()}
      disabled={!ready || !linkToken}
      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-3 text-xs font-medium text-muted-foreground transition-all hover:border-us/50 hover:bg-us-muted/40 hover:text-us disabled:opacity-40"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Connect a bank account
    </button>
  )
}
