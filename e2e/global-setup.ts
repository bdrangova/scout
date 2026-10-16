import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { E2E_BASE_URL, E2E_ROOT, E2E_STORE, repoRoot } from './store.ts'

/** Wipes the throwaway store and rebuilds it with `scripts/make-fixture.ts` before the servers start. */
export default async function globalSetup(): Promise<void> {
  await fs.rm(E2E_ROOT, { recursive: true, force: true })
  await fs.mkdir(E2E_ROOT, { recursive: true })
  execFileSync(path.join(repoRoot, 'node_modules', '.bin', 'tsx'), [path.join(repoRoot, 'scripts', 'make-fixture.ts')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, FIXTURE_OUT: E2E_STORE, DASHBOARD_ORIGIN: E2E_BASE_URL },
  })
}
