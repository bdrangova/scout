import { defineConfig } from '@playwright/test'
import { E2E_API_PORT, E2E_BASE_URL, E2E_STORE, E2E_WEB_PORT } from './e2e/store.ts'

// The smoke test runs against its own throwaway store (built by e2e/global-setup.ts) and its own
// server pair on 4745/4746, so it never touches `fixtures/store` or the dev servers on 4545/4546.
export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev:fixtures',
    // Proxied through Vite to the API, so "ready" means both servers answer.
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      FIXTURE_HOME: E2E_STORE,
      AI_REVIEW_PORT: String(E2E_API_PORT),
      WEB_PORT: String(E2E_WEB_PORT),
      DASHBOARD_URL: E2E_BASE_URL,
      AGENT_ADAPTER: 'fake',
    },
  },
})
