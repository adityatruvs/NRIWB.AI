import { test, expect, type Page } from '@playwright/test'
import { MODES, setMode } from './fixtures'

// Browser checks for this round of bug fixes: one compliance answer across the
// dashboard, FCNR entered in dollars, the Accounts card in the INR view, goal
// funding limited to cash/deposits/investments, and the live FX rate.

const card = (page: Page, heading: string | RegExp) =>
  page.locator('main .card-surface').filter({ has: page.getByText(heading, { exact: typeof heading === 'string' }) })

async function setCurrency(page: Page, mode: 'usd' | 'inr' | 'inr_lakhs') {
  await page.evaluate((m) => localStorage.setItem('currency_mode', m), mode)
}

for (const mode of MODES) {
  test(`header pill, FBAR card and Needs attention agree — ${mode} data`, async ({ page }) => {
    await setMode(page, mode)
    await page.goto('/')
    const pill = page.locator('header').getByTitle('Compliance status')
    await expect(pill).toBeVisible()
    // While accounts load the pill says "Checking…", never a premature "All clear".
    await expect(pill).not.toHaveText(/Checking/)
    const label = (await pill.innerText()).trim()
    expect(label).not.toMatch(/Overdue/) // crossing FBAR this year isn't overdue

    const attention = card(page, 'Needs attention')
    if (label === 'All clear') {
      await expect(attention).toContainText("You're all clear")
    } else {
      expect(label).toMatch(/^Action needed: /)
      await expect(attention).not.toContainText("You're all clear")
      // Every item the pill names is listed in Needs attention.
      for (const name of label.replace(/^Action needed: /, '').split(', ')) {
        await expect(attention).toContainText(name)
      }
    }
    await page.screenshot({ path: `e2e/screenshots/compliance-agree-${mode}.png` })
  })

  test(`goal funding list has no loans, property or vehicles — ${mode} data`, async ({ page }) => {
    await setMode(page, mode)
    await page.goto('/goals')
    await page.getByRole('button', { name: /Add goal/ }).first().click()
    const list = page.getByText('Fund from accounts (optional)').locator('..')
    await expect(list).toBeVisible()
    const text = await list.innerText()
    expect(text).not.toMatch(/Real Estate|Property|Vehicle|Loan|Credit Card|Mortgage|Notes (Payable|Receivable)/)
    expect(text).not.toMatch(/-\$|−\$/) // no negative (debt) balances
    await list.screenshot({ path: `e2e/screenshots/goal-funding-${mode}.png` })
  })

  test(`Accounts country card follows the INR view — ${mode} data`, async ({ page }) => {
    await setMode(page, mode)
    await setCurrency(page, 'inr_lakhs')
    await page.goto('/accounts')
    const us = card(page, 'United States')
    await expect(us).toBeVisible()
    await expect(us).toContainText('₹')
    expect(await us.innerText()).not.toMatch(/\$\d/)
    await us.screenshot({ path: `e2e/screenshots/accounts-inr-${mode}.png` })
    await setCurrency(page, 'usd')
  })
}

test('an FCNR deposit is entered and saved in dollars — real data', async ({ page }) => {
  await setMode(page, 'real')
  await setCurrency(page, 'usd')
  await page.goto('/accounts')
  await page.getByRole('button', { name: /Add account/ }).first().click()
  await page.getByRole('button', { name: /Add manually/ }).click()
  await page.getByRole('button', { name: /India$/ }).click()
  await page.getByLabel('Nickname').fill('E2E FCNR USD')
  await page.getByLabel('Institution').fill('ICICI Bank')
  await page.getByLabel('Type').click()
  await page.getByRole('option', { name: /FCNR/ }).click()
  // The balance field switches to $ for FCNR.
  const balance = page.locator('label').filter({ has: page.getByText('Balance', { exact: true }) })
  await expect(balance).toContainText('$')
  await expect(balance).toContainText('In US dollars')
  await balance.locator('input').fill('50000')
  await page.getByRole('button', { name: /^\+?\s*Add account$/ }).last().click()

  const row = page.locator('main').getByText('E2E FCNR USD').locator('xpath=ancestor::*[contains(@class,"group")][1]')
  await expect(row).toContainText('FCNR Deposit · USD')
  await row.screenshot({ path: 'e2e/screenshots/fcnr-usd-row.png' })

  // What was saved: $50,000, and its rupee value at the live rate (the row's
  // amount is an animated counter, so read the stored account instead).
  const fx = await (await page.request.get('/api/fx')).json()
  await expect
    .poll(async () => {
      const { accounts } = await (await page.request.get('/api/accounts')).json()
      return accounts.find((a: { nickname: string }) => a.nickname === 'E2E FCNR USD') ?? null
    })
    .toMatchObject({ balanceUsd: 50_000 })
  const { accounts } = await (await page.request.get('/api/accounts')).json()
  const saved = accounts.find((a: { nickname: string }) => a.nickname === 'E2E FCNR USD')
  expect(saved.balanceInr).toBeCloseTo(50_000 * fx.rate, -2)
})

test('the sidebar shows the live USD/INR rate the API serves, never a made-up one', async ({ page, request }) => {
  await setMode(page, 'real')
  const fx = await (await request.get('/api/fx')).json()
  expect(['live', 'cached']).toContain(fx.source)
  await page.goto('/')
  await expect(page.locator('aside')).toContainText(`₹${Number(fx.rate).toFixed(2)}`)
})
