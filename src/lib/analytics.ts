/**
 * First-party product events for measuring setup. Names and properties are
 * allowlisted and every property is a number, so an account name, bank or
 * amount cannot be sent even by mistake. Failing to send never affects the app.
 */

export const EVENTS = {
  /** The customer opened "Tell us what you have". */
  tell_us_opened: ['first_ledger'],
  /** A save from that screen put at least one account on the ledger. */
  tell_us_saved: ['first_ledger', 'is_first_save', 'ms_to_first_save', 'accounts', 'type_fixes'],
} as const satisfies Record<string, readonly string[]>

export type EventName = keyof typeof EVENTS
export type EventProps = Record<string, number>

/** The properties an event allows, as whole non-negative numbers; anything else is dropped. */
export function cleanProps(name: string, props: unknown): EventProps | null {
  const allowed = (EVENTS as Record<string, readonly string[]>)[name]
  if (!allowed) return null
  const out: EventProps = {}
  if (props && typeof props === 'object') {
    for (const key of allowed) {
      const v = (props as Record<string, unknown>)[key]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = Math.min(Math.round(v), 86_400_000)
    }
  }
  return out
}

/** Fire and forget. Respects Do Not Track; never throws. */
export function track(name: EventName, props: EventProps = {}): void {
  try {
    if (typeof window === 'undefined' || navigator.doNotTrack === '1') return
    const body = JSON.stringify({ name, props: cleanProps(name, props) })
    if (typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))) return
    }
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* analytics must never break the page */
  }
}
