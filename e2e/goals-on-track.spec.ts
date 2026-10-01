import { test, expect, type Page } from '@playwright/test'
import { MODES, setMode } from './fixtures'

// Bug: a retirement goal whose savings already compound past the target read
// "~$0/mo for 15 years" — correct math, but it looks like missing data.

const goalCard = (page: Page, name: string) =>
  page.locator('main .card-surface').filter({ has: page.getByText(name, { exact: true }) })

for (const mode of MODES) {
  test(`goal on track on savings says so, not "$0/mo" — ${mode} data`, async ({ page }) => {
    await setMode(page, mode)
    await page.goto('/goals')

    const retirement = goalCard(page, 'Retirement')
    await expect(retirement).toContainText(/On track — at ~[\d.]+%\/yr, what you've saved grows to this by 2041/)
    await expect(retirement).not.toContainText('/mo for')
    await expect(retirement).not.toContainText('$0/mo') // (a bare "$0" matches the animated number's digit strip)
    await retirement.screenshot({ path: `e2e/screenshots/goal-retirement-${mode}.png` })

    // A goal that still needs contributions keeps its monthly amount.
    await expect(goalCard(page, "Child's Education")).toContainText(/~\$[\d,]+\/mo for 9 years/)
  })
}
