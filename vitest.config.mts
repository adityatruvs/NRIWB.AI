import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests run in a plain Node environment. The `@/…` alias mirrors the
// tsconfig path mapping so tests import modules the same way app code does.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
