import { appServices, closeApp, createApp } from './app.ts'
import { loadConfig } from './config.ts'

const config = loadConfig()
const app = createApp(config)

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(
    `Scout server listening on http://127.0.0.1:${config.port} (store ${config.home}, adapter ${config.adapter})`,
  )
})

// The first session list computes every session's tree and commit list (a dozen git processes
// each), which takes seconds with many sessions. Doing it now, not on the first request, shares the
// cache with that request, so the dashboard's first load does not sit on "Loading sessions…".
appServices(app)
  .store.listSessions()
  .catch((err: unknown) => console.error('warming the session list failed', err))

let shuttingDown = false
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received, shutting down`)
  setTimeout(() => process.exit(1), 5_000).unref()
  void closeApp(app).finally(() => {
    server.close(() => process.exit(0))
    server.closeAllConnections()
  })
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
