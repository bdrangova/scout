import type { AgentAdapterName, AgentRunEvent, Decision, SessionDetail } from '@scout/shared'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * An `AgentRunEvent` before the `RunManager` numbers it (`seq`, `at`). `raw` is the original
 * stream-json line, persisted verbatim to the run's `.jsonl`; every event parsed from the same
 * line carries the same `raw` string.
 */
export type AdapterEventBody = DistributiveOmit<AgentRunEvent, 'seq' | 'at'>
export type AdapterEvent = AdapterEventBody & { raw?: string }

/** The event without its `raw` line (what gets numbered and kept in memory). */
export function adapterEventBody(event: AdapterEvent): AdapterEventBody {
  const { raw: _raw, ...body } = event
  return body as AdapterEventBody
}

/** What an adapter reads of a session: only the manifest (agent session id, repo or run folder). */
export type AgentSession = Pick<SessionDetail, 'manifest'>

export type CanResumeResult = { ok: true } | { ok: false; reason: string }

export interface ApplyFeedbackRequest {
  session: AgentSession
  sentAt: string
  /** The decision the reviewer sent; `approve` lets the agent commit, push and open a PR. */
  decision: Decision
  fork: boolean
  signal: AbortSignal
  /** Store root, passed to the agent as `AI_REVIEW_HOME`. */
  home: string
}

export interface AgentExit {
  /** Process exit code, `null` when it ended on a signal (or never started). */
  code: number | null
  signal: string | null
}

/** The events of one run plus what the `RunManager` records about the process behind it. */
export interface AgentRunHandle extends AsyncIterable<AdapterEvent> {
  readonly argv: string[]
  readonly pid: number | null
  /** Settles once the iterable is exhausted; never rejects. */
  readonly exit: Promise<AgentExit>
}

export interface AgentAdapter {
  readonly kind: AgentAdapterName
  canResume(session: AgentSession, opts: { fork: boolean }): Promise<CanResumeResult>
  applyFeedback(req: ApplyFeedbackRequest): AgentRunHandle
}
