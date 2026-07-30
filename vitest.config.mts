import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// React component tests are not configured yet because @vitejs/plugin-react
// currently conflicts with this repo's Babel dependency chain.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Use Node by default; component tests can opt into jsdom per file.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporters: ['text'],
      include: ['src/lib/**/*.ts', 'src/app/api/**/route.ts'],
    },
  },
})
