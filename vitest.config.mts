import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// No React/JSX-transform plugin yet: @vitejs/plugin-react currently conflicts with
// shadcn's babel@8 peer dependency chain in this repo (npm ERESOLVE). None of the
// current test files render components, so it isn't needed yet. When component
// tests are added, either resolve that peer conflict or add the plugin then.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Default environment is Node, matching what the lib/ and api/ modules under
    // test actually run in. Component tests (none exist yet) can opt into jsdom
    // per-file with a `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporters: ['text'],
      include: ['src/lib/**/*.ts', 'src/app/api/**/route.ts'],
    },
  },
})
