import { test, expect } from '@playwright/test'
import { MODES, setMode } from './fixtures'

// Stories: change my list with AI (and be asked to be specific when it's unclear),
// edit a row in place with the pencil strip, Export to Excel shown as coming soon.
// The AI routes are stubbed, so this run is free.

const LINES = [
  { id: 's1', name: 'E2E HDFC 1', institution: 'HDFC Bank', country: 'IN', kind: 'asset', type: null, amount: null, currency: 'INR' },
  { id: 's2', name: 'E2E HDFC 2', institution: 'HDFC Bank', country: 'IN', kind: 'asset', type: null, amount: null, currency: 'INR' },
]

for (const mode of MODES) {
  test.describe(`Edit strip, export, change with AI — ${mode} data`, () => {
    test.beforeEach(async ({ page }) => {
      await setMode(page, mode)
      await page.route('**/api/events', (r) => r.fulfill({ status: 204 }))
    })

    test('Export to Excel is shown disabled with "Coming soon"', async ({ page }) => {
      await page.goto('/accounts')
      await expect(page.getByRole('heading', { level: 2, name: 'India' })).toBeVisible()
      const btn = page.getByRole('button', { name: /Export to Excel/ })
      await expect(btn).toBeDisabled()
      await expect(btn).toContainText('Coming soon')
    })

    test('Add row opens a blank row in place; Esc cancels; an empty row will not save', async ({ page }) => {
      await page.goto('/accounts')
      await expect(page.getByRole('heading', { level: 2, name: 'India' })).toBeVisible()
      await page.getByRole('button', { name: 'Add row' }).click()
      const row = page.getByRole('group', { name: 'Add an account' })
      await expect(row).toBeVisible()
      await row.getByLabel('Name').press('Enter')
      await expect(row.getByRole('alert').first()).toBeVisible()
      await row.getByLabel('Name').press('Escape')
      await expect(row).toBeHidden()
    })

    test('Quick edit: balances become inputs, changed rows are counted, Discard puts them back', async ({ page }) => {
      await page.goto('/accounts')
      await expect(page.getByRole('heading', { level: 2, name: 'India' })).toBeVisible()
      await page.getByRole('switch', { name: 'Quick edit' }).click()
      const inputs = page.locator('input[data-quick-balance]')
      await expect(inputs.first()).toBeVisible()
      const before = await inputs.first().inputValue()
      await inputs.first().fill('1')
      await expect(page.getByText('1 balance changed')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save all' })).toBeEnabled()
      await inputs.first().fill('abc')
      await expect(page.getByRole('button', { name: 'Save all' })).toBeDisabled()
      await page.getByRole('button', { name: 'Discard' }).click()
      await expect(inputs.first()).toHaveValue(before)
      await expect(page.getByText('0 balances changed')).toBeVisible()
    })

    test('pencil opens the strip; Esc cancels; a bad balance blocks Enter', async ({ page }) => {
      await page.goto('/accounts')
      await expect(page.getByRole('heading', { level: 2, name: 'India' })).toBeVisible()
      await page.getByRole('button', { name: /^Edit / }).first().click()
      const strip = page.getByRole('group', { name: /^Edit / })
      await expect(strip).toBeVisible()
      const amount = strip.getByLabel(/Balance|Amount owed/)
      if (await amount.isEditable()) {
        await amount.fill('abc')
        await amount.press('Enter')
        await expect(strip.getByRole('alert')).toBeVisible()
      }
      await strip.getByLabel('Name').press('Escape')
      await expect(strip).toBeHidden()
    })

    test('"the HDFC ones are NRE and NRO" changes both lines; an unclear one changes nothing', async ({ page }) => {
      await page.route('**/api/accounts/parse', (r) => r.fulfill({ json: { lines: LINES } }))
      await page.goto('/accounts')
      await page.getByRole('button', { name: 'Add account', exact: true }).first().click()
      await page.getByRole('button', { name: /Add several at once/ }).click()
      await page.getByRole('button', { name: 'Describe them with AI' }).click()
      await page.getByLabel('Describe your accounts').fill('two accounts at HDFC')
      await page.getByRole('button', { name: 'List my accounts' }).click()
      await expect(page.getByRole('button', { name: 'Remove E2E HDFC 2' })).toBeVisible()

      // Unclear: nothing changes, and we are asked to be specific.
      await page.route('**/api/accounts/revise', (r) =>
        r.fulfill({ json: { adds: [], updates: [], ambiguous: 'More than one account fits that: E2E HDFC 1, E2E HDFC 2. Nothing was changed.' } }),
      )
      await page.getByRole('button', { name: 'Add or change with AI' }).click()
      await page.getByLabel('Describe your accounts').fill('HDFC is NRE')
      await page.getByRole('button', { name: 'Update my list' }).click()
      await expect(page.getByText('Nothing was changed.')).toBeVisible()

      // Clear: both change and are announced.
      await page.unroute('**/api/accounts/revise')
      await page.route('**/api/accounts/revise', (r) =>
        r.fulfill({
          json: {
            adds: [],
            updates: [
              { id: 's1', patch: { type: 'nre' } },
              { id: 's2', patch: { type: 'nro' } },
            ],
          },
        }),
      )
      await page.getByLabel('Describe your accounts').fill('the HDFC ones are NRE and NRO')
      await page.getByRole('button', { name: 'Update my list' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Changed 2 accounts' })).toBeVisible()
      await expect(page.getByLabel('Account type').first()).toHaveValue('nre')
    })
  })
}
