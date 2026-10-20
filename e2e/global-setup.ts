import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { E2E_BASE_URL, E2E_ROOT, E2E_STORE, repoRoot } from './store.ts'

/**
 * Playwright starts the web server before this runs, so the server first sees an empty store. Its
 * first session list computes every session's git tree (seconds with 19 sessions, longer on a busy
 * machine), which would land inside the first test's 5 s expectation. Asking for it here, once the
 * store is built, pays that cost before any test starts.
 */
async function warmSessionList(): Promise<void> {
  const res = await fetch(`${E2E_BASE_URL}/api/sessions`, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`warming GET /api/sessions failed: ${res.status}`)
}

/** Wipes the throwaway store and rebuilds it with `scripts/make-fixture.ts` before the servers start. */
export default async function globalSetup(): Promise<void> {
  await fs.rm(E2E_ROOT, { recursive: true, force: true })
  await fs.mkdir(E2E_ROOT, { recursive: true })
  execFileSync(path.join(repoRoot, 'node_modules', '.bin', 'tsx'), [path.join(repoRoot, 'scripts', 'make-fixture.ts')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, FIXTURE_OUT: E2E_STORE, DASHBOARD_ORIGIN: E2E_BASE_URL },
  })
  await warmSessionList()
}
