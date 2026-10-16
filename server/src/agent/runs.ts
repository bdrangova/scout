import { randomBytes } from 'node:crypto'
import { AgentRunEventSchema, mergeComments } from '@review-dash/shared'
import type { AgentRun, AgentRunEvent, AgentRunStatus, Decision, SessionDetail } from '@review-dash/shared'
import { HttpError, errorMessage } from '../errors.ts'
import type { StoreEventBus } from '../events.ts'
import { readTextIfExists } from '../store/fs.ts'
import type { Store } from '../store/index.ts'
import { listRuns, readResolutions, readReview, runLogFile } from '../store/review.ts'
import { adapterEventBody } from './adapter.ts'
import type { AdapterEvent, AdapterEventBody, AgentAdapter, AgentRunHandle } from './adapter.ts'
import { parseStreamJsonLine } from './stream-json.ts'

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000
export const MAX_DURATION_MS = 60 * 60 * 1000

export interface RunListener {
  onEvent(event: AgentRunEvent): void
  onEnd(run: AgentRun): void
}

export interface RunSubscription {
  run: AgentRun
  /** True when the run already ended: every event was replayed and `onEnd` will not fire. */
  finished: boolean
  unsubscribe(): void
}

export interface RunManagerOptions {
  store: Store
  adapter: AgentAdapter
  bus: StoreEventBus
  home: string
  idleTimeoutMs?: number
  maxDurationMs?: number
  now?: () => Date
}

type AbortReason = 'cancel' | 'idle-timeout' | 'max-duration' | 'shutdown'

interface RunRecord {
  run: AgentRun
  sessionDir: string
  events: AgentRunEvent[]
  listeners: Set<RunListener>
  abort: AbortController
  abortReason: AbortReason | null
  finished: Promise<AgentRun>
  /** Serialises `.jsonl` appends. */
  log: Promise<void>
}

const TERMINAL: ReadonlySet<AgentRunStatus> = new Set(['succeeded', 'failed', 'cancelled'])

export function isTerminal(status: AgentRunStatus): boolean {
  return TERMINAL.has(status)
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

/** `run-<yyyymmddHHMMss>-<4hex>` (UTC). */
export function newRunId(date: Date = new Date()): string {
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  return `run-${stamp}-${randomBytes(2).toString('hex')}`
}

/** Ids of the comments whose derived status is `open` / `resolved` right now. */
async function commentStatuses(sessionDir: string, sessionId: string): Promise<{ open: Set<string>; resolved: Set<string> }> {
  const open = new Set<string>()
  const resolved = new Set<string>()
  try {
    const [review, resolutions] = await Promise.all([readReview(sessionDir, sessionId), readResolutions(sessionDir, sessionId)])
    if (review) {
      for (const comment of mergeComments(review, resolutions)) (comment.status === 'open' ? open : resolved).add(comment.id)
    }
  } catch {
    // an unreadable review or resolutions file just means "nothing known"
  }
  return { open, resolved }
}

/**
 * Rebuilds the events of a finished run from its `.jsonl`: raw stream-json lines go through the
 * parser again and event-JSON lines (status, stderr, error) are taken as written, so the `seq`
 * numbers match the ones the run had live.
 */
export async function replayRunLog(sessionDir: string, run: AgentRun): Promise<AgentRunEvent[]> {
  const text = await readTextIfExists(runLogFile(sessionDir, run.id))
  if (text === null) return []
  const events: AgentRunEvent[] = []
  let seq = 1
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let parsed: unknown = null
    try {
      parsed = JSON.parse(line)
    } catch {
      parsed = null
    }
    const stored = AgentRunEventSchema.safeParse(parsed)
    if (stored.success) {
      events.push(stored.data)
      seq = stored.data.seq + 1
      continue
    }
    for (const event of parseStreamJsonLine(line)) {
      events.push({ seq, at: run.startedAt, ...adapterEventBody(event) })
      seq += 1
    }
  }
  return events
}

/**
 * One active run per session. Persists `review/runs/<id>.json` on every status change and one
 * line per event to `<id>.jsonl`, keeps the numbered events in memory for SSE subscribers, and
 * emits `run.updated` on the store event bus.
 */
export class RunManager {
  private readonly store: Store
  private readonly adapter: AgentAdapter
  private readonly bus: StoreEventBus
  private readonly home: string
  private readonly idleTimeoutMs: number
  private readonly maxDurationMs: number
  private readonly now: () => Date
  private readonly records = new Map<string, RunRecord>()
  private readonly activeBySession = new Map<string, string>()

  constructor(options: RunManagerOptions) {
    this.store = options.store
    this.adapter = options.adapter
    this.bus = options.bus
    this.home = options.home
    this.idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS
    this.maxDurationMs = options.maxDurationMs ?? MAX_DURATION_MS
    this.now = options.now ?? (() => new Date())
  }

  get adapterKind(): AgentAdapter['kind'] {
    return this.adapter.kind
  }

  /** The run that is currently active for a session, if this process started one. */
  activeRun(sessionId: string): AgentRun | null {
    const id = this.activeBySession.get(sessionId)
    return id === undefined ? null : (this.records.get(id)?.run ?? null)
  }

  /** Starts the adapter for a session; 409 `HttpError` when a run is already active. */
  async start(session: SessionDetail, opts: { sentAt: string; decision: Decision; fork: boolean }): Promise<AgentRun> {
    const sessionId = session.manifest.id
    const sessionDir = this.store.paths.sessionDir(sessionId)
    await this.reconcileStale(sessionDir)
    if (this.activeBySession.has(sessionId)) {
      throw new HttpError(409, `a run is already active for session ${sessionId} (${this.activeBySession.get(sessionId)})`)
    }
    let id = newRunId(this.now())
    while (this.records.has(id)) id = newRunId(this.now())

    const before = await commentStatuses(sessionDir, sessionId)
    const abort = new AbortController()
    const handle = this.adapter.applyFeedback({ session, sentAt: opts.sentAt, decision: opts.decision, fork: opts.fork, signal: abort.signal, home: this.home })
    const run: AgentRun = {
      id,
      sessionId,
      sentAt: opts.sentAt,
      adapter: this.adapter.kind,
      status: 'running',
      pid: handle.pid,
      argv: handle.argv,
      startedAt: this.now().toISOString(),
      endedAt: null,
      exitCode: null,
      agentSessionId: null,
      numTurns: null,
      costUsd: null,
      resultText: null,
      error: null,
      resolvedComments: [],
    }
    const record: RunRecord = {
      run,
      sessionDir,
      events: [],
      listeners: new Set(),
      abort,
      abortReason: null,
      finished: Promise.resolve(run),
      log: Promise.resolve(),
    }
    this.records.set(id, record)
    this.activeBySession.set(sessionId, id)
    await this.persist(record)
    this.append(record, JSON.stringify(this.emit(record, { type: 'status', status: 'running' })))
    record.finished = this.consume(record, handle, before.open)
    return run
  }

  private async consume(record: RunRecord, handle: AgentRunHandle, openAtStart: Set<string>): Promise<AgentRun> {
    const { run } = record
    let idle: NodeJS.Timeout | null = null
    const resetIdle = (): void => {
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => this.abort(record, 'idle-timeout'), this.idleTimeoutMs)
    }
    resetIdle()
    const cap = setTimeout(() => this.abort(record, 'max-duration'), this.maxDurationMs)

    let result: Extract<AdapterEvent, { type: 'result' }> | null = null
    let lastError: string | null = null
    let lastRaw: string | undefined
    try {
      for await (const adapterEvent of handle) {
        resetIdle()
        const raw = adapterEvent.raw
        const event = this.emit(record, adapterEventBody(adapterEvent))
        if (raw !== undefined) {
          if (raw !== lastRaw) this.append(record, raw)
          lastRaw = raw
        } else {
          this.append(record, JSON.stringify(event))
        }
        if (event.type === 'init') run.agentSessionId = event.sessionId
        else if (event.type === 'result') result = { ...event }
        else if (event.type === 'error') lastError = event.message
      }
    } catch (err) {
      lastError = errorMessage(err)
    }
    const exit = await handle.exit
    if (idle) clearTimeout(idle)
    clearTimeout(cap)

    run.endedAt = this.now().toISOString()
    run.exitCode = exit.code
    if (result) {
      run.resultText = result.text
      run.costUsd = result.costUsd
      run.numTurns = result.numTurns
    }
    if (record.abortReason === 'cancel' || record.abortReason === 'shutdown') {
      run.status = 'cancelled'
      run.error = record.abortReason === 'shutdown' ? 'the server shut down while the run was active' : null
    } else if (record.abortReason === 'idle-timeout') {
      run.status = 'failed'
      run.error = `no output for ${Math.round(this.idleTimeoutMs / 60_000)} min, the run was stopped`
    } else if (record.abortReason === 'max-duration') {
      run.status = 'failed'
      run.error = `the run exceeded ${Math.round(this.maxDurationMs / 60_000)} min and was stopped`
    } else if (result && !result.isError && (exit.code === 0 || exit.code === null)) {
      run.status = 'succeeded'
    } else {
      run.status = 'failed'
      run.error =
        lastError ??
        (result?.isError ? result.text : null) ??
        (exit.code === null ? 'the agent ended without a result' : `the agent exited with code ${exit.code}`)
    }

    const after = await commentStatuses(record.sessionDir, run.sessionId)
    run.resolvedComments = [...openAtStart].filter((id) => after.resolved.has(id))

    const final = this.emit(record, { type: 'status', status: run.status })
    this.append(record, JSON.stringify(final))
    await record.log
    await this.persist(record)
    this.activeBySession.delete(run.sessionId)
    for (const listener of record.listeners) {
      try {
        listener.onEnd(run)
      } catch (err) {
        console.error('run listener failed', err)
      }
    }
    record.listeners.clear()
    return run
  }

  private emit(record: RunRecord, event: AdapterEventBody): AgentRunEvent {
    const numbered: AgentRunEvent = { seq: record.events.length + 1, at: this.now().toISOString(), ...event }
    record.events.push(numbered)
    for (const listener of record.listeners) {
      try {
        listener.onEvent(numbered)
      } catch (err) {
        console.error('run listener failed', err)
      }
    }
    return numbered
  }

  private append(record: RunRecord, line: string): void {
    record.log = record.log
      .then(() => this.store.appendRunLog(record.sessionDir, record.run.id, line))
      .catch((err: unknown) => console.error(`failed to append to run log ${record.run.id}`, err))
  }

  private async persist(record: RunRecord): Promise<void> {
    await this.store.writeRun(record.sessionDir, record.run)
    this.bus.emit({ type: 'run.updated', sessionId: record.run.sessionId, runId: record.run.id })
  }

  private abort(record: RunRecord, reason: AbortReason): void {
    if (record.abortReason !== null || isTerminal(record.run.status)) return
    record.abortReason = reason
    record.abort.abort()
  }

  /** Runs left `queued`/`running` on disk by a previous server process are marked failed. */
  private async reconcileStale(sessionDir: string): Promise<void> {
    for (const run of await listRuns(sessionDir)) {
      if (isTerminal(run.status) || this.records.has(run.id)) continue
      const failed: AgentRun = {
        ...run,
        status: 'failed',
        endedAt: this.now().toISOString(),
        error: 'the server restarted while this run was active',
      }
      await this.store.writeRun(sessionDir, failed)
      this.bus.emit({ type: 'run.updated', sessionId: run.sessionId, runId: run.id })
    }
  }

  /** Every run of a session (disk), with the in-memory state of runs this process started. */
  async list(sessionId: string): Promise<AgentRun[]> {
    const sessionDir = this.store.paths.sessionDir(sessionId)
    await this.reconcileStale(sessionDir)
    return (await listRuns(sessionDir)).map((run) => this.records.get(run.id)?.run ?? run)
  }

  async get(runId: string): Promise<AgentRun | null> {
    const record = this.records.get(runId)
    if (record) return record.run
    return (await this.store.findRun(runId))?.run ?? null
  }

  /** Aborts an active run (SIGINT for the CLI); a no-op for finished runs. `null` when unknown. */
  async cancel(runId: string): Promise<AgentRun | null> {
    const record = this.records.get(runId)
    if (record) {
      this.abort(record, 'cancel')
      return record.run
    }
    return (await this.store.findRun(runId))?.run ?? null
  }

  /** Resolves with the final run once it ended. */
  async wait(runId: string): Promise<AgentRun | null> {
    const record = this.records.get(runId)
    return record ? record.finished : this.get(runId)
  }

  /**
   * Replays the events with `seq > fromSeq` (from memory, or from the `.jsonl` for runs of a
   * previous server process) and keeps the listener attached while the run is active.
   */
  async subscribe(runId: string, fromSeq: number, listener: RunListener): Promise<RunSubscription | null> {
    const record = this.records.get(runId)
    if (record) {
      for (const event of record.events) if (event.seq > fromSeq) listener.onEvent(event)
      const finished = isTerminal(record.run.status)
      // Live events are filtered too: a subscriber that already saw `fromSeq` must not get older ones.
      const live: RunListener = {
        onEvent: (event) => {
          if (event.seq > fromSeq) listener.onEvent(event)
        },
        onEnd: listener.onEnd,
      }
      if (!finished) record.listeners.add(live)
      return { run: record.run, finished, unsubscribe: () => record.listeners.delete(live) }
    }
    const located = await this.store.findRun(runId)
    if (!located) return null
    for (const event of await replayRunLog(located.sessionDir, located.run)) {
      if (event.seq > fromSeq) listener.onEvent(event)
    }
    return { run: located.run, finished: true, unsubscribe: () => undefined }
  }

  /** Aborts every active run and waits for them to settle. */
  async close(): Promise<void> {
    const active = [...this.activeBySession.values()].map((id) => this.records.get(id)).filter((r): r is RunRecord => r !== undefined)
    for (const record of active) this.abort(record, 'shutdown')
    await Promise.all(active.map((record) => record.finished))
  }
}
