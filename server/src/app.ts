import express from 'express'
import type { ErrorRequestHandler, Express, Request, Response } from 'express'
import type { ApiError } from '@review-dash/shared'
import type { AgentAdapter } from './agent/adapter.ts'
import { ClaudeCodeAdapter } from './agent/claude-code.ts'
import { FakeAdapter } from './agent/fake.ts'
import type { FakeAdapterOptions } from './agent/fake.ts'
import { RunManager } from './agent/runs.ts'
import type { Config } from './config.ts'
import { StoreEventBus } from './events.ts'
import { artifactsRouter } from './routes/artifacts.ts'
import { eventsRouter } from './routes/events.ts'
import { filesRouter } from './routes/files.ts'
import { healthRouter } from './routes/health.ts'
import { prCommentsRouter } from './routes/pr-comments.ts'
import { reviewRouter } from './routes/review.ts'
import { runFilesRouter } from './routes/run-files.ts'
import { runsRouter } from './routes/runs.ts'
import { scopesRouter } from './routes/scopes.ts'
import { sendRouter } from './routes/send.ts'
import { sessionsRouter } from './routes/sessions.ts'
import { localOnly } from './security.ts'
import { SseRegistry } from './sse.ts'
import { Store } from './store/index.ts'
import type { StoreOptions } from './store/index.ts'
import { StoreWatcher } from './watcher.ts'
import type { WatcherOptions } from './watcher.ts'

function statusOf(err: unknown): number {
  if (err && typeof err === 'object') {
    for (const key of ['status', 'statusCode'] as const) {
      const value = (err as Record<string, unknown>)[key]
      if (typeof value === 'number' && value >= 400 && value <= 599) return value
    }
  }
  return 500
}

/**
 * Every error thrown or rejected inside a route ends up here (Express 5 forwards rejected
 * promises) and is answered as an `ApiError` JSON body. Throw an `Error` with a numeric
 * `status` (or `statusCode`) property to pick the HTTP status; an optional `reason` string
 * property is copied into the body.
 */
const errorHandler: ErrorRequestHandler = (err: unknown, _req: Request, res: Response, _next) => {
  const status = statusOf(err)
  const message = err instanceof Error ? err.message : String(err)
  const body: ApiError = { error: status === 500 ? 'internal server error' : message }
  const reason = err && typeof err === 'object' ? (err as { reason?: unknown }).reason : undefined
  if (typeof reason === 'string') body.reason = reason
  if (status === 500) console.error(err)
  if (res.headersSent) {
    res.end()
    return
  }
  res.status(status).json(body)
}

/** Everything a running app owns; `closeApp` tears it down. */
export interface AppServices {
  config: Config
  store: Store
  bus: StoreEventBus
  adapter: AgentAdapter
  runs: RunManager
  watcher: StoreWatcher
  sse: SseRegistry
}

/** Test hooks: a custom adapter, faster fake replay, quicker watchers and tree debounce, shorter run timeouts. */
export interface AppOverrides {
  adapter?: AgentAdapter
  fake?: FakeAdapterOptions
  watcher?: WatcherOptions
  trees?: StoreOptions['trees']
  scopes?: StoreOptions['scopes']
  runs?: { idleTimeoutMs?: number; maxDurationMs?: number }
  log?: (message: string) => void
}

function buildAdapter(config: Config, overrides: AppOverrides): AgentAdapter {
  if (overrides.adapter) return overrides.adapter
  if (config.adapter === 'fake') return new FakeAdapter(overrides.fake)
  return new ClaudeCodeAdapter({ claudeBin: config.claudeBin })
}

export function createApp(config: Config, overrides: AppOverrides = {}): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use('/api', localOnly(config.dashboardUrl))
  app.use(express.json({ limit: '5mb' }))

  const bus = new StoreEventBus()
  const store = new Store(config.home, { bus, ...(overrides.trees ? { trees: overrides.trees } : {}), ...(overrides.scopes ? { scopes: overrides.scopes } : {}), ...(overrides.log ? { log: overrides.log } : {}) })
  const adapter = buildAdapter(config, overrides)
  const runs = new RunManager({ store, adapter, bus, home: config.home, ...overrides.runs })
  const watcher = new StoreWatcher(store, bus, { ...(overrides.log ? { log: overrides.log } : {}), ...overrides.watcher })
  const sse = new SseRegistry()
  const services: AppServices = { config, store, bus, adapter, runs, watcher, sse }
  app.locals.services = services
  // The tree cache is only correct while the repos are watched, so watching starts with the app.
  watcher.start()

  const api = express.Router()
  api.use(healthRouter(config))
  api.use(sessionsRouter(store))
  api.use(filesRouter(store))
  api.use(scopesRouter(store))
  api.use(artifactsRouter(store))
  api.use(runFilesRouter(store))
  api.use(reviewRouter(store))
  api.use(prCommentsRouter(store))
  api.use(sendRouter({ store, runs, adapter, dashboardUrl: config.dashboardUrl }))
  api.use(runsRouter({ store, runs, adapter, sse }))
  api.use(eventsRouter({ bus, watcher, sse }))
  app.use('/api', api)

  app.use('/api', (req: Request, res: Response) => {
    const body: ApiError = { error: `no route for ${req.method} ${req.originalUrl}` }
    res.status(404).json(body)
  })
  app.use(errorHandler)
  return app
}

export function appServices(app: Express): AppServices {
  const services = app.locals.services as AppServices | undefined
  if (!services) throw new Error('app was not created by createApp')
  return services
}

/** Aborts active runs, ends open SSE streams, stops the watchers and the tree cache. */
export async function closeApp(app: Express): Promise<void> {
  const { runs, sse, watcher, store } = appServices(app)
  await runs.close()
  sse.closeAll()
  await watcher.close()
  store.close()
}
