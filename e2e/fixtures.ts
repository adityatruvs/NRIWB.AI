import { expect, type Page } from '@playwright/test'

/**
 * The QA user's real (server-side) ledger, reset before every run. Mirrors the
 * demo seed's shape: an NRE FD, an NRO FD, NRO savings, FCNR, and a US account.
 */
export const QA_LEDGER = [
  { nickname: 'Chase Checking', institution: 'Chase', accountType: 'checking', country: 'US', balanceUsd: 12_000, balanceInr: 12_000 * 83.5 },
  { nickname: 'HDFC NRE FD', institution: 'HDFC Bank', accountType: 'fd', country: 'IN', balanceUsd: 4_500_000 / 83.5, balanceInr: 4_500_000, details: { fdScheme: 'NRE', interestRate: 7 } },
  { nickname: 'SBI Fixed Deposit', institution: 'SBI', accountType: 'fd', country: 'IN', balanceUsd: 1_200_000 / 83.5, balanceInr: 1_200_000, details: { fdScheme: 'NRO' } },
  { nickname: 'SBI NRO Savings', institution: 'SBI', accountType: 'nro', country: 'IN', balanceUsd: 800_000 / 83.5, balanceInr: 800_000 },
  { nickname: 'ICICI FCNR', institution: 'ICICI', accountType: 'fcnr', country: 'IN', balanceUsd: 20_000, balanceInr: 20_000 * 83.5, details: { depositCurrency: 'USD' } },
]

/** The QA user's real goals, reset before every run (mirrors two of the demo seed goals). */
export const QA_GOALS = [
  { name: 'Retirement', category: 'retirement', targetUsd: 2_000_000, currentUsd: 400_000, targetYear: 2041 },
  { name: "Child's Education", category: 'education', targetUsd: 250_000, currentUsd: 60_000, targetYear: 2035 },
]

export type Mode = 'real' | 'demo'
export const MODES: Mode[] = ['real', 'demo']

/**
 * Put the signed-in QA user in real or demo mode. Demo mode is the per-user
 * localStorage flag AccountsContext reads on mount (`nriwb:demo:<userId>`).
 */
export async function setMode(page: Page, mode: Mode) {
  await page.goto('/privacy')
  await page.waitForFunction(() => !!(window as unknown as { Clerk?: { user?: unknown } }).Clerk?.user)
  await page.evaluate((demo) => {
    const id = (window as unknown as { Clerk: { user: { id: string } } }).Clerk.user.id
    if (demo) localStorage.setItem(`nriwb:demo:${id}`, '1')
    else localStorage.removeItem(`nriwb:demo:${id}`)
  }, mode === 'demo')
}

/** The sidebar link for an item, by its visible label. */
export const sidebarLink = (page: Page, label: string) =>
  page.locator('aside').getByRole('link', { name: new RegExp(`^${label}`) })

export async function shot(page: Page, name: string) {
  await expect(page.locator('main')).toBeVisible()
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: false })
}
