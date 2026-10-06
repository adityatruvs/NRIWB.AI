import { prisma } from '@/lib/prisma'

export const FX_PAIR = 'USD_INR'

/**
 * A saved rate is used for a day; after that the next request fetches (and saves)
 * a fresh one. The daily cron (/api/fx/update, 06:00 UTC) normally does it first.
 */
/** How long to wait for the live rate before using the saved one. */
export const FX_FETCH_TIMEOUT_MS = 4_000

export const FX_STALE_AFTER_MS = 24 * 60 * 60 * 1000

export interface FxSnapshot {
  rate: number
  updatedAt: string | null
  /** `live`: just fetched and saved. `cached`: the last saved live rate. */
  source: 'live' | 'cached'
}

/** No live rate could be fetched and none was ever saved — there is no rate to use. */
export class FxUnavailableError extends Error {
  constructor(cause: string) {
    super(`USD/INR rate unavailable: ${cause}`)
    this.name = 'FxUnavailableError'
  }
}

async function fetchLiveRate(): Promise<number> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  if (!apiKey) throw new Error('EXCHANGE_RATE_API_KEY is not set')

  // Bounded: pages wait on this when the saved rate is stale, so a hung provider
  // must fail fast and fall back to the last saved rate.
  const res = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/INR`, {
    signal: AbortSignal.timeout(FX_FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`exchangerate-api responded ${res.status}`)

  const data = (await res.json()) as { result?: string; conversion_rate?: number }
  if (data.result !== 'success' || typeof data.conversion_rate !== 'number') {
    throw new Error(`exchangerate-api returned ${data.result ?? 'an unknown'} result`)
  }
  return data.conversion_rate
}

export async function refreshFxRate(): Promise<FxSnapshot> {
  const rate = await fetchLiveRate()
  try {
    const row = await prisma.fxRate.upsert({
      where: { pair: FX_PAIR },
      update: { rate },
      create: { pair: FX_PAIR, rate },
    })
    return { rate: row.rate, updatedAt: row.updatedAt.toISOString(), source: 'live' }
  } catch (e) {
    // Couldn't save it, but it's still the live rate: use it rather than lose it.
    console.error('[fx] fetched the live rate but could not save it:', (e as Error).message)
    return { rate, updatedAt: new Date().toISOString(), source: 'live' }
  }
}

export async function getFxSnapshot(): Promise<FxSnapshot> {
  let cached: FxSnapshot | null = null
  try {
    const row = await prisma.fxRate.findUnique({ where: { pair: FX_PAIR } })
    if (row) {
      cached = { rate: row.rate, updatedAt: row.updatedAt.toISOString(), source: 'cached' }
      if (Date.now() - row.updatedAt.getTime() < FX_STALE_AFTER_MS) return cached
    }
  } catch (e) {
    console.error('[fx] failed to read cached rate:', (e as Error).message)
  }

  // Missing or stale: fetch the live rate and save it. If the live API can't be
  // reached, use the last saved live rate. There is no hardcoded rate: with
  // nothing ever saved, callers get FxUnavailableError instead of a made-up number.
  try {
    return await refreshFxRate()
  } catch (e) {
    if (cached) {
      console.error('[fx] refresh failed, serving the last saved live rate:', (e as Error).message)
      return cached
    }
    console.error('[fx] no live rate and none saved yet:', (e as Error).message)
    throw new FxUnavailableError((e as Error).message)
  }
}
