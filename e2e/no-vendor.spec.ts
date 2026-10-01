import { test, expect } from '@playwright/test'
import { MODES, setMode } from './fixtures'

// Ticket: the Copilot header showed "Claude Sonnet 4.6 · live". End users should
// see "NRIWB AI" — never the model or vendor — including in error states.
const VENDOR = /Claude|Sonnet|Anthropic|ANTHROPIC_API_KEY|\.env\.local/

for (const mode of MODES) {
  test.describe(`No AI vendor/model in the UI — ${mode} data`, () => {
    test.beforeEach(async ({ page }) => {
      await setMode(page, mode)
    })

    for (const path of ['/copilot', '/analyzer']) {
      test(`${path} never names the model or vendor`, async ({ page }) => {
        await page.goto(path)
        await expect(page.locator('main')).toBeVisible()
        await expect(page.locator('main')).not.toContainText(VENDOR)
      })
    }

    test('a failed Copilot reply shows a friendly NRIWB AI message, not setup instructions', async ({ page }) => {
      // Simulate the AI being down — no real model call is made.
      await page.route('**/api/copilot', (route) => route.fulfill({ status: 500, body: 'error' }))
      await page.goto('/copilot')
      const box = page.locator('main textarea')
      await box.fill('Do I need to file FBAR this year?')
      await box.press('Enter')

      const main = page.locator('main')
      await expect(main).toContainText("NRIWB AI couldn't respond just now. Please try again in a moment.")
      await expect(main).not.toContainText(VENDOR)
    })
  })
}
