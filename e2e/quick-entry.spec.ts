import { test, expect, type Page } from '@playwright/test'
import { MODES, setMode, shot } from './fixtures'

// Stories: what I said becomes one line per account; I check every line on one
// screen; nothing is saved until every line has a type and an amount. Then the
// saved accounts are a sheet whose cells edit in place.
//
// The AI route is stubbed with what the model returns for the screenshot's
// sentence (the live call is covered in ai-live.spec.ts), so this run is free.

const P = 'E2E QE'
const HEARD = [
  { name: `${P} HDFC 1`, institution: 'HDFC Bank', country: 'IN', kind: 'asset', type: null, amount: null, currency: 'INR', hint: 'savings' },
  { name: `${P} HDFC 2`, institution: 'HDFC Bank', country: 'IN', kind: 'asset', type: null, amount: null, currency: 'INR', hint: 'savings' },
  { name: `${P} Axis NRE FD`, institution: 'Axis Bank', country: 'IN', kind: 'asset', type: 'fd_nre', amount: 500000, currency: 'INR' },
  { name: `${P} Flat`, institution: '', country: 'IN', kind: 'asset', type: 'property', amount: null, currency: 'INR' },
  { name: `${P} Chase`, institution: 'Chase', country: 'US', kind: 'asset', type: 'checking', amount: null, currency: 'USD' },
  { name: `${P} Schwab`, institution: 'Charles Schwab', country: 'US', kind: 'asset', type: 'brokerage', amount: 95000, currency: 'USD' },
  { name: `${P} 401k`, institution: 'Fidelity', country: 'US', kind: 'asset', type: '401k', amount: null, currency: 'USD' },
].map((l, i) => ({ id: `stub-${i}`, ...l }))

async function stubParse(page: Page) {
  await page.route('**/api/accounts/parse', (r) => r.fulfill({ json: { lines: HEARD } }))
}

/** Add account → Add several at once (the checklist). */
async function openAddSeveral(page: Page) {
  await page.getByRole('button', { name: 'Add account', exact: true }).first().click()
  await page.getByRole('button', { name: /Add several at once/ }).click()
  await expect(page.getByRole('heading', { name: 'What do you have?' })).toBeVisible()
}

/** A line on the review list, by its name. */
const line = (page: Page, name: string) =>
  page.getByRole('button', { name: `Remove ${name}` }).locator('xpath=ancestor::*[@data-line][1]')

type Saved = { id: string; nickname: string; accountType: string; balanceUsd: number; balanceInr: number; details?: { fdScheme?: string } }
const savedQe = async (page: Page) => {
  const { accounts } = (await (await page.request.get('/api/accounts')).json()) as { accounts: Saved[] }
  return accounts.filter((a) => a.nickname.startsWith(P))
}
async function cleanUp(page: Page) {
  for (const a of await savedQe(page)) await page.request.delete(`/api/accounts/${a.id}`)
}

for (const mode of MODES) {
  test.describe(`Quick entry and the sheet — ${mode} data`, () => {
    test.beforeEach(async ({ page }) => {
      await setMode(page, mode)
      if (mode === 'real') await cleanUp(page)
      await stubParse(page)
      await page.goto('/accounts')
      await expect(page.getByRole('heading', { level: 2, name: 'India' })).toBeVisible()
    })
    test.afterEach(async ({ page }) => {
      if (mode === 'real') await cleanUp(page)
    })

    test('said → one line per account → checked on one screen → saved only when complete', async ({ page }) => {
      await openAddSeveral(page)
      await page.getByRole('button', { name: 'Describe them with AI' }).click()
      await page.getByLabel('Describe your accounts').fill('Two accounts at HDFC, an NRE FD at Axis for 5 lakh, a flat in Hyderabad…')
      await page.getByRole('button', { name: 'List my accounts' }).click()

      await expect(page.getByRole('heading', { name: 'Here’s what we heard' })).toBeVisible()
      await expect(page.locator('[data-line]')).toHaveCount(7)
      const save = page.getByRole('button', { name: /^Save/ })
      await expect(save).toBeDisabled()
      await expect(page.getByText('2 need a type')).toBeVisible()
      await expect(page.getByText('5 need an amount')).toBeVisible()
      await shot(page, `quick-entry-review-${mode}`)

      // The two HDFC lines: pick NRE / NRO with the nudges, then type amounts.
      await line(page, `${P} HDFC 1`).getByRole('button', { name: 'NRE Savings' }).click()
      await line(page, `${P} HDFC 2`).getByLabel('Account type').selectOption('nro')
      const amounts: [string, string][] = [
        [`${P} HDFC 1`, '40L'],
        [`${P} HDFC 2`, '8 lakh'],
        [`${P} Flat`, '1.2Cr'],
        [`${P} Chase`, '5k'],
      ]
      await expect(page.getByText('2 need a type')).toHaveCount(0)
      for (const [name, v] of amounts) {
        const box = line(page, name).getByLabel('Balance', { exact: true })
        await box.fill(v)
        await box.press('Enter')
      }
      // One still missing: still nothing to save.
      await expect(page.getByText('1 needs an amount')).toBeVisible()
      await expect(save).toBeDisabled()

      const last = line(page, `${P} 401k`).getByLabel('Balance', { exact: true })
      await last.fill('60k')
      await last.press('Enter')
      await expect(page.getByText('Ready to save')).toBeVisible()
      await expect(save).toHaveText('Save 7 accounts')
      await shot(page, `quick-entry-ready-${mode}`)
      await save.click()

      await expect(page.getByText('Saved 7 accounts.')).toBeVisible()
      // The confirmation gives net worth in both currencies and a way back to the list.
      const confirmation = page.getByRole('status').filter({ hasText: 'Saved 7 accounts.' })
      await expect(confirmation).toContainText(/net worth is now\s+[-−]?\$[\d,]+\s*\/\s*[-−]?₹[\d,]+/)
      await expect(confirmation.getByRole('link', { name: 'View in Accounts' })).toBeVisible()
      await expect(page.getByRole('textbox', { name: `Name of ${P} Schwab` })).toBeVisible()
      await shot(page, `accounts-sheet-${mode}`)

      if (mode === 'real') {
        const saved = await savedQe(page)
        expect(saved).toHaveLength(7)
        const by = (n: string) => saved.find((a) => a.nickname === `${P} ${n}`)!
        expect(by('HDFC 1')).toMatchObject({ accountType: 'nre', balanceInr: 4_000_000 })
        expect(by('HDFC 2')).toMatchObject({ accountType: 'nro', balanceInr: 800_000 })
        expect(by('Axis NRE FD')).toMatchObject({ accountType: 'fd', details: { fdScheme: 'NRE' }, balanceInr: 500_000 })
        expect(by('Flat')).toMatchObject({ accountType: 'property', balanceInr: 12_000_000 })
        expect(by('Schwab')).toMatchObject({ accountType: 'brokerage', balanceUsd: 95_000 })
        expect(by('401k')).toMatchObject({ accountType: '401k', balanceUsd: 60_000 })
        // Survives a reload — it's in the database.
        await page.reload()
        await expect(page.getByRole('textbox', { name: `Name of ${P} Flat` })).toBeVisible()
      }

      // The sheet edits in place: a balance, a type, a name.
      const bal = page.getByLabel(`Balance of ${P} Schwab`)
      await bal.fill('120k')
      await bal.press('Enter')
      await page.getByLabel(`Type of ${P} HDFC 2`).selectOption('fd_nro')
      const nameBox = page.getByRole('textbox', { name: `Name of ${P} Chase` })
      await nameBox.fill(`${P} Chase Checking`)
      await nameBox.press('Enter')
      await expect(page.getByRole('textbox', { name: `Name of ${P} Chase Checking` })).toBeVisible()
      await expect(page.getByLabel(`Balance of ${P} Schwab`)).toHaveValue('$120,000')

      if (mode === 'real') {
        await expect
          .poll(async () => (await savedQe(page)).find((a) => a.nickname === `${P} Schwab`)?.balanceUsd)
          .toBe(120_000)
        await expect
          .poll(async () => {
            const h = (await savedQe(page)).find((a) => a.nickname === `${P} HDFC 2`)
            return h && { t: h.accountType, s: h.details?.fdScheme, inr: h.balanceInr }
          })
          .toEqual({ t: 'fd', s: 'NRO', inr: 800_000 })
        await expect
          .poll(async () => (await savedQe(page)).some((a) => a.nickname === `${P} Chase Checking`))
          .toBe(true)
      }
    })

    test('leaving with unsaved lines asks first', async ({ page }) => {
      // The checklist is the first screen.
      await openAddSeveral(page)
      await shot(page, `add-several-start-${mode}`)
      await page.getByRole('button', { name: 'Add Property to India assets' }).click()
      await expect(page.locator('[data-line]')).toHaveCount(1)
      await expect(page.getByRole('button', { name: /^Save/ })).toBeDisabled()

      await page.getByRole('button', { name: 'Back to my accounts' }).click()
      await expect(page.getByText('Discard 1 unsaved line?')).toBeVisible()
      await page.getByRole('button', { name: 'Keep editing' }).click()
      await expect(page.locator('[data-line]')).toHaveCount(1)

      await page.getByRole('button', { name: 'Back to my accounts' }).click()
      await page.getByRole('button', { name: 'Discard', exact: true }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'India' })).toBeVisible()
    })

    test('an AI failure says so and keeps what was typed', async ({ page }) => {
      await page.unroute('**/api/accounts/parse')
      await page.route('**/api/accounts/parse', (r) => r.fulfill({ status: 502, json: { error: 'NRIWB AI couldn’t read that just now. Try again in a moment.' } }))
      await openAddSeveral(page)
      await page.getByRole('button', { name: 'Describe them with AI' }).click()
      await page.getByLabel('Describe your accounts').fill('HDFC NRE 40 lakh')
      await page.getByRole('button', { name: 'List my accounts' }).click()
      await expect(page.getByText('NRIWB AI couldn’t read that just now.')).toBeVisible()
      await expect(page.getByLabel('Describe your accounts')).toHaveValue('HDFC NRE 40 lakh')
    })
  })
}

test('Add with AI lives in the Add account chooser and the empty ledger, not on the page', async ({ page }) => {
  await setMode(page, 'real')
  await page.goto('/accounts')
  await expect(page.getByRole('heading', { level: 2, name: 'India' })).toBeVisible()
  // No stray AI card on the page itself.
  await expect(page.getByText('Describe it — Copilot fills in the details')).toHaveCount(0)

  await page.getByRole('button', { name: 'Add account', exact: true }).click()
  const aiOption = page.getByRole('button', { name: /^Add with AI/ })
  await expect(aiOption).toBeVisible()
  await page.waitForTimeout(400) // let the chooser finish animating in for the screenshot
  await shot(page, 'add-account-chooser')
  await aiOption.click()
  const dialog = page.getByRole('dialog', { name: 'Add with AI' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('What are we adding?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Minimize' }).click()
  await expect(dialog).toHaveCount(0)

  // An empty ledger offers the ways to add up front (the ledger is stubbed empty here).
  await page.route('**/api/accounts', (r) =>
    r.request().method() === 'GET' ? r.fulfill({ json: { accounts: [] } }) : r.continue(),
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Start your ledger' })).toBeVisible()
  await shot(page, 'empty-ledger')
  for (const name of [/^Add with AI/, /^Add manually/, /^Add several at once/]) {
    await expect(page.getByRole('button', { name })).toBeVisible()
  }
  await page.getByRole('button', { name: /^Add with AI/ }).click()
  await expect(page.getByRole('dialog', { name: 'Add with AI' })).toBeVisible()
})
