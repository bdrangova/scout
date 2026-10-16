import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where the smoke test keeps its own copy of the fixture store and which ports its servers use, so
 * a run never touches `fixtures/store` or the dev servers on 4545/4546. The location is fixed (not a
 * `mkdtemp`) because `playwright.config.ts` is evaluated before `globalSetup` can hand a path over;
 * the setup wipes and rebuilds it, the teardown removes it.
 */
export const E2E_ROOT = path.join(os.tmpdir(), 'review-dash-e2e')
export const E2E_STORE = path.join(E2E_ROOT, 'store')
export const E2E_API_PORT = 4745
export const E2E_WEB_PORT = 4746
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_WEB_PORT}`

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
