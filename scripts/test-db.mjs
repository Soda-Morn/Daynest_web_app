/**
 * Runs the database security tests (tests-db/) against the local Supabase
 * stack. Reads the local URL and keys from `supabase status`, so no secrets
 * are stored anywhere.
 *
 *   npx supabase start      # once
 *   npm run test:db
 */
import { execSync, spawnSync } from 'node:child_process'

let env
try {
  env = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  console.error('Local Supabase is not running. Start it with: npx supabase start')
  process.exit(1)
}
const vars = Object.fromEntries(
  env
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)
const result = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.db.config.js'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    SUPABASE_URL: vars.API_URL,
    SUPABASE_ANON_KEY: vars.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: vars.SERVICE_ROLE_KEY,
  },
})
process.exit(result.status ?? 1)
