export const runtime = 'nodejs'

const FALLBACK_RATE = 95

export async function GET() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR', {
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`)
    const data = await res.json()
    const rate: number = data.rates?.INR
    if (!rate) throw new Error('Missing INR rate in response')
    return Response.json({ rate })
  } catch {
    return Response.json({ rate: FALLBACK_RATE })
  }
}
