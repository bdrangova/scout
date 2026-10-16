// Runs `npm run dev` against the fixture store with the fake agent adapter, from any cwd.
// Optional overrides, all defaulting to the usual dev setup: FIXTURE_HOME (store root), AI_REVIEW_PORT
// (API, also the web proxy target) and WEB_PORT. The e2e run uses them to start a second, isolated pair.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

// Browser-preview harnesses inject PORT for the web port; the API server must not pick it up.
const env = { ...process.env }
delete env.PORT

const apiPort = env.AI_REVIEW_PORT ?? '4545'
const webPort = env.WEB_PORT ?? '4546'

const child = spawn(npm, ['run', 'dev'], {
  cwd: repo,
  stdio: 'inherit',
  env: {
    ...env,
    AI_REVIEW_HOME: env.FIXTURE_HOME ?? path.join(repo, 'fixtures', 'store'),
    AI_REVIEW_PORT: apiPort,
    API_PORT: apiPort,
    WEB_PORT: webPort,
    AGENT_ADAPTER: 'fake',
  },
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
