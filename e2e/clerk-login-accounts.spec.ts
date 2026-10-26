import { test, expect } from '@playwright/test'

test('Manage Account labels the social-login section "Connected login accounts"', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('aside')).toBeVisible({ timeout: 60_000 })

  await page.locator('.cl-userButtonTrigger').click()
  await page.getByRole('menuitem', { name: /manage account/i }).click()

  const modal = page.locator('.cl-userProfile-root')
  await expect(modal.getByText('Connected login accounts', { exact: true })).toBeVisible()
  await expect(modal.getByText('Connected accounts', { exact: true })).toHaveCount(0)

  await page.screenshot({ path: 'e2e/screenshots/manage-account-login-accounts.png' })
})
