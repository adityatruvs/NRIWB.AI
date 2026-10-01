import { test, expect, type Page } from '@playwright/test'
import { MODES, setMode } from './fixtures'

// Bug: the Child's Education card read "by 2035 · age 64" — the parent's age,
// which looks like the child's. Education goals now show just the year; other
// goals keep "· age N" (the user's own age at the target year).

const goalCard = (page: Page, name: string) =>
  page.locator('main .card-surface').filter({ has: page.getByText(name, { exact: true }) })

for (const mode of MODES) {
  test.describe(`Goal target age — ${mode} data`, () => {
    test.beforeEach(async ({ page }) => {
      await setMode(page, mode)
      await page.goto('/goals')
      await expect(goalCard(page, "Child's Education")).toBeVisible()
    })

    test('education card shows just the year; retirement still shows your age', async ({ page }) => {
      const edu = goalCard(page, "Child's Education")
      await expect(edu).toContainText('by 2035')
      await expect(edu).not.toContainText(/·\s*age \d+/)

      await expect(goalCard(page, 'Retirement')).toContainText(/by 2041 · age \d+/)

      await edu.screenshot({ path: `e2e/screenshots/goal-education-${mode}.png` })
    })

    test('education goal editor shows no age on the target year', async ({ page }) => {
      await page.getByRole('button', { name: "Edit Child's Education" }).click()
      const yearField = page.locator('label').filter({ hasText: /^Target year/ })
      await expect(yearField).toBeVisible()
      await expect(yearField).not.toContainText("you'll be")
      await expect(yearField.locator('option', { hasText: /age \d+/ })).toHaveCount(0)
      await page.keyboard.press('Escape')

      // Retirement keeps it.
      await page.getByRole('button', { name: 'Edit Retirement' }).click()
      await expect(page.locator('label').filter({ hasText: /^Target year — you'll be \d+/ })).toBeVisible()
    })
  })
}
