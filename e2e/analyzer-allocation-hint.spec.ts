import { test, expect, type Page } from '@playwright/test'
import { MODES, setMode } from './fixtures'

// Bug: the "Your allocation" hint said "toggle Current (left)" — "left" isn't a
// control (and the donut stacks above on narrow screens). The panel now says
// plainly what to do and has its own compare button.

const panel = (page: Page) =>
  page.locator('main .card-surface').filter({ has: page.getByRole('heading', { name: 'Your allocation' }) })

for (const mode of MODES) {
  test(`allocation panel explains itself and can switch to compare — ${mode} data`, async ({ page }) => {
    await setMode(page, mode)
    await page.goto('/analyzer')
    const p = panel(page)
    await expect(p).toBeVisible()
    await expect(p).not.toContainText('(left)')
    await expect(p).toContainText('Drag a slider or use − / + to set your target mix')

    // The panel's own button switches the comparison on (and the donut follows).
    await p.getByRole('button', { name: 'Compare with my holdings' }).click()
    await expect(p).toContainText('What you hold now vs your target')
    await expect(page.locator('main').getByText('Current', { exact: true }).first()).toBeVisible()
    await p.screenshot({ path: `e2e/screenshots/analyzer-allocation-${mode}.png` })

    await p.getByRole('button', { name: 'Back to target' }).click()
    await expect(p).toContainText('Drag a slider or use − / + to set your target mix')
  })
}

test('narrow screen: the hint still makes sense (no "left"), compare button is in the panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setMode(page, 'demo')
  await page.goto('/analyzer')
  const p = panel(page)
  await expect(p).not.toContainText('(left)')
  await expect(p.getByRole('button', { name: 'Compare with my holdings' })).toBeVisible()
})
