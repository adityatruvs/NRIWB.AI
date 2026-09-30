'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { RefreshCw } from 'lucide-react'

/**
 * "Reconnect" for a linked account whose bank login expired. Opens Plaid Link in
 * update mode for that item; on success, re-syncs it (which marks the item active
 * again, clearing the badge) and calls `onDone` so the ledger reloads.
 */
export function ReconnectButton({
  itemId,
  rate,
  onDone,
}: {
  itemId: string
  rate: number
  onDone: () => void
}) {
  const [token, setToken] = useState<string | null>(null)
  const [wanted, setWanted] = useState(false)
  const [busy, setBusy] = useState(false)

  const onSuccess = useCallback(async () => {
    setBusy(true)
    try {
      await fetch('/api/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, rate }),
      })
      onDone()
    } finally {
      setBusy(false)
      setToken(null)
    }
  }, [itemId, rate, onDone])

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: (err) => {
      if (err) console.error('Plaid Link (reconnect) error:', err)
      setToken(null)
    },
  })

  // Fetch the update-mode token on click, then open Link once it's ready.
  useEffect(() => {
    if (wanted && token && ready) {
      setWanted(false)
      open()
    }
  }, [wanted, token, ready, open])

  async function start() {
    setWanted(true)
    const res = await fetch('/api/plaid/create-link-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId }),
    })
    const data = await res.json().catch(() => null)
    if (data?.link_token) setToken(data.link_token)
    else setWanted(false)
  }

  return (
    <button
      onClick={start}
      disabled={busy || wanted}
      title="Your bank login expired — reconnect to resume syncing"
      className="inline-flex shrink-0 items-center gap-1 rounded bg-warning/12 px-1.5 py-px text-[10.5px] font-semibold text-warning ring-1 ring-warning/25 transition-colors hover:bg-warning/20 disabled:opacity-60"
    >
      <RefreshCw size={10} className={busy ? 'animate-spin' : undefined} />
      Reconnect
    </button>
  )
}
