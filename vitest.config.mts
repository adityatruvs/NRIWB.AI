import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Plain unit tests (*.test.ts) run in a Node environment. Component tests (*.test.tsx)
// opt into jsdom themselves via a `// @vitest-environment jsdom` pragma at the top of
// the file, so the DOM cost is only paid where it's actually needed. The `@/…` alias
// mirrors the tsconfig path mapping so tests import modules the same way app code does.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
