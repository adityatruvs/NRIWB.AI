import { test, expect, type Page } from '@playwright/test'
import { MODES, setMode, shot } from './fixtures'

// Bug: "HDFC NRE FD" sat under Cash & Banking while "SBI Fixed Deposit" sat
// under Fixed Deposits. Fix: FDs are picked per scheme (NRE/NRO Fixed Deposit).

/** The India group card on the Accounts page. */
const indiaCard = (page: Page) =>
  page.locator('main .card-surface').filter({ has: page.getByRole('heading', { level: 2, name: 'India' }) })

for (const mode of MODES) {
  test.describe(`FD categories — ${mode} data`, () => {
    test.beforeEach(async ({ page }) => {
      await setMode(page, mode)
      await page.goto('/accounts')
      await expect(indiaCard(page)).toBeVisible()
    })

    test('both FDs are labelled Fixed Deposit and the breakdown has one Fixed Deposits bucket', async ({ page }) => {
      const india = indiaCard(page)
      for (const name of ['HDFC NRE FD', 'SBI Fixed Deposit']) {
        const row = india.getByText(name, { exact: true }).locator('xpath=ancestor::*[contains(., "·")][1]')
        await expect(row).toContainText('Fixed Deposit')
      }
      await expect(india).toContainText('Fixed Deposits')
      await india.screenshot({ path: `e2e/screenshots/accounts-india-${mode}.png` })
    })

    test('India type list offers FDs per scheme; an FD-named savings account gets a suggestion', async ({ page }) => {
      await page.getByRole('button', { name: 'Add account' }).first().click()
      // A chooser comes first (Plaid / Indian bank / manual).
      await page.getByRole('button', { name: /Add manually/ }).click()
      const dialog = page // the dialog has no role — its fields are unique on the page
      await dialog.getByRole('button', { name: /India$/ }).click() // label carries the 🇮🇳 flag

      const typeSelect = page.locator('label').filter({ hasText: /^Type/ }).getByRole('combobox')
      await typeSelect.click()
      const options = page.getByRole('option')
      await expect(options.filter({ hasText: 'NRE Fixed Deposit' })).toHaveCount(1)
      await expect(options.filter({ hasText: 'NRO Fixed Deposit' })).toHaveCount(1)
      await expect(options.filter({ hasText: 'NRE Savings' })).toHaveCount(1)
      await expect(options.filter({ hasText: 'FCNR Deposit' })).toHaveCount(1)
      await expect(options.filter({ hasText: /^Fixed Deposit$/ })).toHaveCount(0)
      await options.filter({ hasText: 'NRE Savings' }).click()

      const nickname = `E2E ${mode} NRE FD`
      await dialog.getByLabel('Nickname').fill(nickname)
      const suggest = dialog.getByRole('button', { name: 'Use NRE Fixed Deposit' })
      await expect(suggest).toBeVisible()
      await shot(page, `fd-suggestion-${mode}`)
      await suggest.click()
      await expect(typeSelect).toContainText('NRE Fixed Deposit')
      await expect(suggest).toHaveCount(0)

      await dialog.getByLabel('Institution').fill('ICICI Bank')
      await dialog.getByLabel('Balance').fill('4000000')
      await dialog.getByRole('button', { name: 'Add account', exact: true }).last().click()

      // Saved as an FD. In real mode it must survive a reload (it's in the DB).
      if (mode === 'real') await page.reload()
      const row = indiaCard(page).getByText(nickname, { exact: true }).locator('xpath=ancestor::*[contains(., "·")][1]')
      await expect(row).toContainText('Fixed Deposit')
    })
  })
}
