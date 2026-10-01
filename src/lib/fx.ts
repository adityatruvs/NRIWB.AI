import { prisma } from '@/lib/prisma'

export const FX_PAIR = 'USD_INR'

export const FX_FALLBACK_RATE = 83.5

export const FX_STALE_AFTER_MS = 60 * 60 * 1000

export interface FxSnapshot {
  rate: number
  updatedAt: string | null
  source: 'live' | 'cached' | 'fallback'
}

async function fetchLiveRate(): Promise<number> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  if (!apiKey) throw new Error('EXCHANGE_RATE_API_KEY is not set')

  const res = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/INR`)
  if (!res.ok) throw new Error(`exchangerate-api responded ${res.status}`)

  const data = (await res.json()) as { result?: string; conversion_rate?: number }
  if (data.result !== 'success' || typeof data.conversion_rate !== 'number') {
    throw new Error(`exchangerate-api returned ${data.result ?? 'an unknown'} result`)
  }
  return data.conversion_rate
}

export async function refreshFxRate(): Promise<FxSnapshot> {
  const rate = await fetchLiveRate()
  const row = await prisma.fxRate.upsert({
    where: { pair: FX_PAIR },
    update: { rate },
    create: { pair: FX_PAIR, rate },
  })
  return { rate: row.rate, updatedAt: row.updatedAt.toISOString(), source: 'live' }
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

  // Missing or stale: refresh on demand so the rate stays live without relying on the daily cron.
  try {
    return await refreshFxRate()
  } catch (e) {
    if (cached) {
      console.error('[fx] refresh failed, serving stale cached rate:', (e as Error).message)
      return cached
    }
    console.error('[fx] bootstrap fetch failed, using hardcoded fallback:', (e as Error).message)
    return { rate: FX_FALLBACK_RATE, updatedAt: null, source: 'fallback' }
  }
}
