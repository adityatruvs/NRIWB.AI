import { test, expect } from '@playwright/test'
import { MODES, setMode, sidebarLink, shot } from './fixtures'

// Bug: Compliance and Deadlines in the sidebar opened the dashboard ("/").
for (const mode of MODES) {
  test.describe(`Compliance & Deadlines placeholders — ${mode} data`, () => {
    test.beforeEach(async ({ page }) => {
      await setMode(page, mode)
    })

    for (const [label, path] of [['Compliance', '/compliance'], ['Deadlines', '/deadlines']] as const) {
      test(`${label}: sidebar item shows Soon and opens its placeholder`, async ({ page }) => {
        await page.goto('/')
        const link = sidebarLink(page, label)
        await expect(link).toContainText('Soon')

        await link.click()
        await expect(page).toHaveURL(path)
        const main = page.locator('main')
        await expect(main.getByRole('heading', { level: 1 })).toContainText(label)
        await expect(main).toContainText("We're building this — check back soon.")
        // The item is now the active one (brand indicator bar), Dashboard isn't.
        await expect(link.locator('.bg-brand')).toHaveCount(1)
        await expect(sidebarLink(page, 'Dashboard').locator('.bg-brand')).toHaveCount(0)

        // "In the meantime" links go where they say.
        await main.getByRole('link', { name: /Ask the AI Copilot/ }).click()
        await expect(page).toHaveURL('/copilot')

        await page.goto(path)
        await shot(page, `${label.toLowerCase()}-${mode}`)
      })
    }
  })
}
