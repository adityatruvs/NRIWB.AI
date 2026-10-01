import { clerk, clerkSetup } from '@clerk/testing/playwright'
import { test as setup, expect } from '@playwright/test'
import { assertClockInSync, ensureQaUser, QA_EMAIL } from './qa-user'
import { QA_GOALS, QA_LEDGER } from './fixtures'

setup.describe.configure({ mode: 'serial' })

setup('sign in the QA user and reset their data', async ({ page }) => {
  await assertClockInSync()
  await clerkSetup() // testing token — gets past Clerk's bot protection
  await ensureQaUser()

  // clerk.signIn needs a page that loads Clerk; /privacy is public.
  await page.goto('/privacy')
  // emailAddress → a server-side sign-in token: no password, no email code.
  await clerk.signIn({ page, emailAddress: QA_EMAIL })
  // Load an app page so Clerk writes its session cookie, which page.request sends.
  await page.goto('/')
  await expect(page.locator('aside')).toBeVisible({ timeout: 60_000 })

  // Real mode reads the server ledger — reset it to a known set through the app's
  // own API (the same path the Accounts page uses), so every run starts identical.
  const res = await page.request.get('/api/accounts')
  expect(res.ok(), `GET /api/accounts ${res.status()}`).toBe(true)
  const { accounts } = (await res.json()) as { accounts: { id: string }[] }
  for (const a of accounts) {
    const del = await page.request.delete(`/api/accounts/${a.id}`)
    expect(del.ok(), `DELETE account ${del.status()}`).toBe(true)
  }
  for (const body of QA_LEDGER) {
    const add = await page.request.post('/api/accounts', { data: body })
    expect(add.status(), `POST ${body.nickname}: ${await add.text()}`).toBe(201)
  }

  // Same for goals (/api/goals).
  const gRes = await page.request.get('/api/goals')
  expect(gRes.ok(), `GET /api/goals ${gRes.status()}`).toBe(true)
  const { goals } = (await gRes.json()) as { goals: { id: string }[] }
  for (const g of goals) {
    const del = await page.request.delete(`/api/goals/${g.id}`)
    expect(del.ok(), `DELETE goal ${del.status()}`).toBe(true)
  }
  for (const body of QA_GOALS) {
    const add = await page.request.post('/api/goals', { data: body })
    expect(add.ok(), `POST goal ${body.name}: ${await add.text()}`).toBe(true)
  }

  await page.context().storageState({ path: 'e2e/.auth/qa.json' })
})
