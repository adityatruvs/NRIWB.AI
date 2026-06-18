'use client'

import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'

export default function OAuthCallbackPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('plaid_link_token')
    if (stored) setLinkToken(stored)
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    receivedRedirectUri: typeof window !== 'undefined' ? window.location.href : '',
    onSuccess: () => {
      window.location.href = '/plaid'
    },
    onExit: () => {
      window.location.href = '/plaid'
    },
  })

  useEffect(() => {
    if (ready) open()
  }, [ready, open])

  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <p className="animate-pulse text-sm text-muted-foreground">Completing bank connection…</p>
    </main>
  )
}
