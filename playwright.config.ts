import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

// Same env the app uses. @clerk/testing reads CLERK_PUBLISHABLE_KEY (no NEXT_PUBLIC_).
loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

const PORT = 3100
// Point at a deployment instead of a local server, e.g. a post-deploy smoke test:
//   E2E_BASE_URL=https://nriwb-ai-cyie.vercel.app npm run e2e
const REMOTE = process.env.E2E_BASE_URL

/**
 * End-to-end tests: a real browser, signed in as the QA user (see e2e/global.setup.ts),
 * against `next dev` (or E2E_BASE_URL). Run with `npm run e2e`. Screenshots land in
 * e2e/screenshots/.
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: false, // one QA user + one server-side ledger — keep runs serial
  workers: 1,
  retries: 0,
  timeout: 90_000, // first hit of each route compiles it under `next dev`
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: REMOTE ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/qa.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: REMOTE
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}/privacy`,
        reuseExistingServer: true,
        timeout: 180_000,
      },
})
