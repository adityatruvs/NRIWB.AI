'use client'

import { useCallback, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'

interface PlaidAccount {
  account_id: string
  name: string
  official_name: string | null
  mask: string | null
  type: string
  subtype: string | null
  balances: {
    available: number | null
    current: number | null
    iso_currency_code: string | null
  }
}

export function PlaidLink({ linkToken }: { linkToken: string }) {
  const [status, setStatus] = useState<'idle' | 'connected' | 'error'>('idle')
  const [institution, setInstitution] = useState('')
  const [accounts, setAccounts] = useState<PlaidAccount[]>([])

  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    const res = await fetch('/api/plaid/exchange-public-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token }),
    })
    if (res.ok) {
      const data = await res.json()
      setInstitution(metadata.institution?.name ?? 'your bank')
      setAccounts(data.accounts ?? [])
      setStatus('connected')
    } else {
      setStatus('error')
    }
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      if (err) console.error('Plaid Link error:', err)
    },
  })

  if (status === 'error') {
    return <p className="text-sm text-danger">Something went wrong. Check the console.</p>
  }

  if (status === 'connected') {
    return (
      <div className="w-full max-w-2xl space-y-4 text-left">
        <h2 className="text-lg font-semibold text-success">Connected to {institution}</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Account</th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pr-4 text-right font-medium">Available</th>
              <th className="pb-2 text-right font-medium">Current</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.account_id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {a.name}
                  {a.mask && <span className="ml-1 text-muted-foreground/70">••{a.mask}</span>}
                </td>
                <td className="py-2 pr-4 capitalize text-muted-foreground">
                  {a.subtype ?? a.type}
                </td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums">
                  {a.balances.available != null
                    ? `$${a.balances.available.toLocaleString()}`
                    : '—'}
                </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {a.balances.current != null
                    ? `$${a.balances.current.toLocaleString()}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className="btn-primary rounded-xl px-4 py-2 text-[13px] font-medium disabled:pointer-events-none disabled:opacity-50"
    >
      Connect a bank account
    </button>
  )
}
