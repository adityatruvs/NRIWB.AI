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

    test('both FDs are typed Fixed Deposit (per scheme) and sit in the same folder', async ({ page }) => {
      const india = indiaCard(page)
      // The sheet's type cell shows each FD per scheme.
      await expect(india.getByLabel('Type of HDFC NRE FD')).toHaveValue('fd_nre')
      await expect(india.getByLabel('Type of SBI Fixed Deposit')).toHaveValue('fd_nro')
      // Both in the same category folder (the folder header sits just before its rows).
      const folderOf = (name: string) =>
        india
          .getByRole('textbox', { name: `Name of ${name}` })
          .evaluate((el) => {
            const header = el.closest('[id^="acct-"]')?.parentElement?.previousElementSibling
            return header?.matches('[aria-expanded]') ? (header.querySelector('.font-semibold')?.textContent ?? null) : null
          })
      const folder = await folderOf('HDFC NRE FD')
      expect(folder).toBeTruthy()
      expect(await folderOf('SBI Fixed Deposit')).toBe(folder)
      await india.screenshot({ path: `e2e/screenshots/accounts-india-${mode}.png` })
    })

    test('India type list offers FDs per scheme; an FD-named savings account gets a suggestion', async ({ page }) => {
      await page.getByRole('button', { name: 'Add account', exact: true }).first().click()
      // A chooser comes first (Plaid / Indian bank / manual).
      await page.getByRole('button', { name: /Add manually/ }).click()
      const dialog = page // the dialog has no role — its fields are unique on the page
      await dialog.getByRole('button', { name: /India$/ }).click() // label carries the 🇮🇳 flag

      const typeSelect = page.locator('label').filter({ hasText: /^Type/ }).getByRole('combobox')
      await typeSelect.click()
      const options = page.getByRole('listbox').getByRole('option')
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
      await page.locator('label').filter({ has: page.getByText('Balance', { exact: true }) }).locator('input').fill('4000000')
      await dialog.getByRole('button', { name: 'Add account', exact: true }).last().click()

      // Saved as an FD. In real mode it must survive a reload (it's in the DB).
      if (mode === 'real') await page.reload()
      await expect(indiaCard(page).getByLabel(`Type of ${nickname}`)).toHaveValue('fd_nre')
    })
  })
}
