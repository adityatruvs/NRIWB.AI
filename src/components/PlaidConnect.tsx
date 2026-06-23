'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import type { AccountType, AccountSource } from '@/types/accounts'

interface RawPlaidAccount {
  account_id: string
  name: string
  mask: string | null
  type: string
  subtype: string | null
  balances: { available: number | null; current: number | null }
}

export interface LinkedAccount {
  nickname: string
  institution: string
  accountType: AccountType
  country: 'US'
  balanceUsd: number
  balanceInr: number
  currency: string
  isManual: boolean
  source: AccountSource
  isPfic: boolean
  userId: string
}

interface Props {
  onLinked: (accounts: LinkedAccount[]) => void
  fxRate: number
}

const SUBTYPE_MAP: Record<string, AccountType> = {
  checking: 'checking',
  savings: 'savings',
  brokerage: 'brokerage',
  '401k': '401k',
  ira: 'ira',
  roth: 'roth_ira',
  'roth ira': 'roth_ira',
  'roth 401k': '401k',
}

function mapType(subtype: string | null, type: string): AccountType {
  return SUBTYPE_MAP[subtype?.toLowerCase() ?? ''] ?? SUBTYPE_MAP[type] ?? 'other'
}

/** Map raw Plaid accounts into our LinkedAccount shape. Shared by PlaidConnect and the add-account chooser. */
export function buildLinkedAccounts(
  rawAccounts: RawPlaidAccount[],
  institutionName: string,
  fxRate: number,
): LinkedAccount[] {
  return rawAccounts.map((a) => ({
    userId: 'plaid-user',
    nickname: `${institutionName} ${a.name}`,
    institution: institutionName,
    accountType: mapType(a.subtype, a.type),
    country: 'US',
    balanceUsd: a.balances.current ?? a.balances.available ?? 0,
    balanceInr: (a.balances.current ?? a.balances.available ?? 0) * fxRate,
    currency: 'USD',
    isManual: false,
    source: 'plaid',
    isPfic: false,
  }))
}

export type { RawPlaidAccount }

export function PlaidConnect({ onLinked, fxRate }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/plaid/create-link-token', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => setLinkToken(d.link_token))
  }, [])

  const onSuccess = useCallback(
    async (public_token: string, metadata: any) => {
      const res = await fetch('/api/plaid/exchange-public-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      })
      const data = await res.json()
      const institutionName: string = metadata.institution?.name ?? 'Bank'
      onLinked(buildLinkedAccounts(data.accounts as RawPlaidAccount[], institutionName, fxRate))
    },
    [onLinked, fxRate]
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
        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      Connect a bank account
    </button>
  )
}
