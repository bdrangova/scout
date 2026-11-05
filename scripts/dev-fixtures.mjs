// Runs `npm run dev` against the fixture store with the fake agent adapter, from any cwd.
// Runs on its own ports (API 4555, web 4556) so it can sit next to the real Scout on 4545/4546.
// Optional overrides: FIXTURE_HOME (store root), SCOUT_PORT (API, also the web proxy target) and
// WEB_PORT. The e2e run uses them to start a third, isolated pair.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

// Browser-preview harnesses inject PORT for the web port; the API server must not pick it up.
const env = { ...process.env }
delete env.PORT

const apiPort = env.SCOUT_PORT ?? '4555'
const webPort = env.WEB_PORT ?? '4556'

const child = spawn(npm, ['run', 'dev'], {
  cwd: repo,
  stdio: 'inherit',
  env: {
    ...env,
    SCOUT_HOME: env.FIXTURE_HOME ?? path.join(repo, 'fixtures', 'store'),
    SCOUT_PORT: apiPort,
    API_PORT: apiPort,
    WEB_PORT: webPort,
    DASHBOARD_URL: env.DASHBOARD_URL ?? `http://scout.localhost:${webPort}`,
  },
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
