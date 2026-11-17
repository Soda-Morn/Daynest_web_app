import { defineConfig } from 'vitest/config'

/** Database security tests (real local Supabase). Run via `npm run test:db`. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests-db/**/*.test.js'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
