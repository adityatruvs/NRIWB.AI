import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests run in a plain Node environment. The `@/…` alias mirrors the
// tsconfig path mapping so tests import modules the same way app code does.
export default defineConfig({
  test: {
    environment: 'node',
    // .test.tsx: components rendered to static HTML (react-dom/server) — no DOM needed.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
