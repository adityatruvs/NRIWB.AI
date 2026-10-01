/**
 * The dedicated QA user the e2e suite signs in as — never a real person's account.
 * `+clerk_test` addresses are Clerk test emails: no mail is ever sent to them.
 */
export const QA_EMAIL = 'nriwb-qa+clerk_test@truvs.com'

const API = 'https://api.clerk.com/v1'

async function clerk(path: string, init: RequestInit = {}) {
  const key = process.env.CLERK_SECRET_KEY
  if (!key?.startsWith('sk_test_')) throw new Error('e2e needs a CLERK_SECRET_KEY test key (sk_test_…)')
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new Error(`Clerk ${init.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

/**
 * Clerk rejects session tokens whose issued-at time looks >5s in the future, so a
 * slow system clock silently signs the QA user out (the server logs "clock skew").
 * Fail fast with the fix instead.
 */
export async function assertClockInSync() {
  const res = await fetch(`${API}/jwks`, { method: 'HEAD' })
  const serverMs = Date.parse(res.headers.get('date') ?? '')
  if (Number.isNaN(serverMs)) return // no Date header — can't check, carry on
  const skewS = (serverMs - Date.now()) / 1000
  if (Math.abs(skewS) > 3) {
    throw new Error(
      `System clock is ${Math.abs(skewS).toFixed(1)}s ${skewS > 0 ? 'slow' : 'fast'} — Clerk will reject the session. ` +
        'Sync it: Settings → Time & language → Date & time → "Sync now" (or `w32tm /resync` as admin).',
    )
  }
}

/**
 * Find or create the QA user, with onboarding already complete so the app opens
 * straight to the dashboard (AppGate reads privateMetadata.onboardingComplete).
 */
export async function ensureQaUser(): Promise<string> {
  const found = (await clerk(`/users?email_address=${encodeURIComponent(QA_EMAIL)}`)) as { id: string }[]
  const id =
    found[0]?.id ??
    ((await clerk('/users', {
      method: 'POST',
      body: JSON.stringify({
        email_address: [QA_EMAIL],
        first_name: 'QA',
        last_name: 'Tester',
        skip_password_requirement: true,
      }),
    })) as { id: string }).id

  // Metadata has its own endpoint (it merges, so re-running is harmless).
  await clerk(`/users/${id}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify({
      private_metadata: {
        onboardingComplete: true,
        onboardedAt: '2026-09-30T00:00:00.000Z',
        dateOfBirth: '1988-04-12',
        countryOfResidence: 'US',
        taxStatus: 'h1b',
        usImmigrationStatus: 'h1b',
        indiaTaxResidency: 'nri',
        riskTolerance: 'moderate',
        goals: ['retirement'],
        holdings: ['us_bank', 'nre', 'india_fd'],
      },
    }),
  })
  return id
}
