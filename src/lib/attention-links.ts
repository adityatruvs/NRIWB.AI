/**
 * Where each "Needs attention" item takes the user to fix it. Routes are built
 * here from a fixed key — never taken from model output — so a prompt-injected
 * link can't reach the UI.
 */

import { isLiability, type Holding } from '@/lib/portfolio'

/** Every key an attention item (rule-based or AI) may carry. */
export const ATTENTION_KEYS = [
  'fbar',
  'fatca',
  'pfic',
  'nro_tds',
  'stale',
  'debt_currency',
  'allocation',
  'residency',
] as const
export type AttentionKey = (typeof ATTENTION_KEYS)[number]

export function isAttentionKey(k: unknown): k is AttentionKey {
  return typeof k === 'string' && (ATTENTION_KEYS as readonly string[]).includes(k)
}

const focus = (h: Holding | undefined, fallback: string) =>
  h?.id ? `/accounts?focus=${encodeURIComponent(h.id)}` : fallback

/** The in-app route that resolves an item, or undefined when there's no good target. */
export function attentionHref(key: AttentionKey, holdings: Holding[]): string | undefined {
  switch (key) {
    case 'fbar':
    case 'fatca':
      return '/accounts?country=IN'
    case 'pfic':
      return focus(holdings.find((h) => h.isPfic), '/accounts?country=IN')
    case 'nro_tds':
      return focus(
        holdings.find((h) => h.country === 'IN' && h.accountType === 'nro'),
        '/accounts?country=IN',
      )
    case 'stale':
      return '/accounts?sort=stale'
    case 'debt_currency':
      // The debt summary on Accounts, where the exposure is explained.
      return holdings.some(isLiability) ? '/accounts?section=debt' : '/accounts?country=IN'
    case 'allocation':
      return '/analyzer'
    case 'residency':
      return undefined
  }
}

/** Attach each item's route (unknown keys get none and render unlinked). */
export function withHrefs<T extends { key: string }>(items: T[], holdings: Holding[]): (T & { href?: string })[] {
  return items.map((it) => {
    const href = isAttentionKey(it.key) ? attentionHref(it.key, holdings) : undefined
    return href ? { ...it, href } : it
  })
}
