/** API calls and pure helpers for Submit and the agent run view. */
import type { AgentRun, AgentRunEvent, AgentRunStatus, Decision, SendResponse } from '@scout/shared'
import { ApiRequestError, apiGet, apiPost } from './api'

function sessionPath(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}`
}

/** Where the sent feedback goes: the Claude Code session the review came from, or a new one. */
export type SendTarget = 'current' | 'new'

export const SEND_TARGET_LABELS: Record<SendTarget, string> = {
  current: 'Current session',
  new: 'New session',
}

export const DECISION_LABELS: Record<Exclude<Decision, 'undecided'>, string> = {
  approve: 'Approve',
  'request-changes': 'Request changes',
  reject: 'Reject',
}

/** What each target does, shown under its name in the send menu. */
export const SEND_TARGET_HINTS: Record<SendTarget, string> = {
  current: 'Continue the Claude Code session that wrote this',
  new: 'Open a fresh Claude Desktop session',
}

export type SessionOrigin = 'desktop' | 'cli' | 'other'

/**
 * Where the session was started from, read off `manifest.agent.entrypoint`. The exact string
 * Claude Desktop writes is unverified, so any mention of "desktop" counts.
 */
export function sessionOrigin(agent: { entrypoint: string | null }): SessionOrigin {
  const entrypoint = agent.entrypoint?.toLowerCase() ?? ''
  if (entrypoint.includes('desktop')) return 'desktop'
  if (entrypoint.includes('cli')) return 'cli'
  return 'other'
}

export function sendReview(
  sessionId: string,
  decision: Decision,
  { dispatch = true }: { dispatch?: boolean } = {},
): Promise<SendResponse> {
  return apiPost<SendResponse>(`${sessionPath(sessionId)}/review/send`, { decision, dispatch })
}

export function listRuns(sessionId: string): Promise<AgentRun[]> {
  return apiGet<AgentRun[]>(`${sessionPath(sessionId)}/runs`)
}

export function startRun(sessionId: string, fork: boolean): Promise<AgentRun> {
  return apiPost<AgentRun>(`${sessionPath(sessionId)}/runs`, { fork })
}

export function cancelRun(runId: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/runs/${encodeURIComponent(runId)}/cancel`)
}

/** The slash command that applies sent feedback: `/apply-review` for a code review, `/apply-test-review` for a test run. */
export type ReviewCommand = '/apply-review' | '/apply-test-review'

export function applyReviewCommand(sessionId: string, command: ReviewCommand = '/apply-review'): string {
  return `${command} ${sessionId}`
}

/**
 * Claude Desktop deep link that opens a new session in `repoPath` (the agent's working directory) with the apply command
 * prefilled (Desktop asks for confirmation before sending it).
 */
export function desktopNewSessionUrl(repoPath: string, sessionId: string, command: ReviewCommand = '/apply-review'): string {
  const query = encodeURIComponent(applyReviewCommand(sessionId, command))
  return `claude://code/new?q=${query}&folder=${encodeURIComponent(repoPath)}`
}

export function runEventsUrl(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/events`
}

/** `error` (and `reason` when the server gives one) of a failed request, or the plain message. */
export function describeApiError(reason: unknown): string {
  if (reason instanceof ApiRequestError) {
    const body = reason.body
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      const detail = 'reason' in body && typeof body.reason === 'string' ? `: ${body.reason}` : ''
      return `${body.error}${detail}`
    }
    return reason.message
  }
  return reason instanceof Error ? reason.message : String(reason)
}

export function isRunActive(status: AgentRunStatus): boolean {
  return status === 'queued' || status === 'running'
}

/** `2m 14s`, `48s`, `1h 05m`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(2)}`
}

/** `turn 6 · $0.42 · 2m 14s`, skipping the parts that are unknown. */
export function formatRunFooter(input: {
  numTurns: number | null
  costUsd: number | null
  durationMs: number | null
}): string {
  const parts: string[] = []
  if (input.numTurns !== null) parts.push(`turn ${input.numTurns}`)
  if (input.costUsd !== null) parts.push(formatCost(input.costUsd))
  if (input.durationMs !== null) parts.push(formatElapsed(input.durationMs))
  return parts.join(' · ')
}

export function runDurationMs(run: AgentRun, now: Date = new Date()): number {
  const start = Date.parse(run.startedAt)
  const end = run.endedAt ? Date.parse(run.endedAt) : now.getTime()
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(0, end - start)
}

const SUMMARY_KEYS = ['file_path', 'path', 'command', 'pattern', 'query', 'url', 'description', 'prompt'] as const

/** The file path, the command, … of a tool call, for its one-line header. */
export function toolInputSummary(input: unknown): string {
  if (typeof input === 'string') return input
  if (!input || typeof input !== 'object') return ''
  const record = input as Record<string, unknown>
  for (const key of SUMMARY_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value.split('\n')[0] ?? value
  }
  const json = JSON.stringify(input)
  return json.length > 100 ? `${json.slice(0, 100)}…` : json
}

/** The result of a tool call that the permission rules blocked. */
export function isDeniedResult(text: string): boolean {
  return /permission|denied|not allowed|not in the allowlist|requires approval/i.test(text)
}

export type TranscriptItem =
  | { kind: 'init'; key: string; model: string; sessionId: string }
  | { kind: 'text'; key: string; text: string; streaming: boolean }
  | {
      kind: 'tool'
      key: string
      toolUseId: string
      name: string
      input: unknown
      result: { text: string; isError: boolean } | null
    }
  | { kind: 'stderr'; key: string; line: string }
  | { kind: 'error'; key: string; message: string }

export type ResultSummary = Extract<AgentRunEvent, { type: 'result' }>

export interface Transcript {
  items: TranscriptItem[]
  status: AgentRunStatus | null
  result: ResultSummary | null
  lastSeq: number
}

export const EMPTY_TRANSCRIPT: Transcript = { items: [], status: null, result: null, lastSeq: 0 }

function finishStreaming(items: TranscriptItem[]): TranscriptItem[] {
  const last = items[items.length - 1]
  if (last && last.kind === 'text' && last.streaming) {
    return [...items.slice(0, -1), { ...last, streaming: false }]
  }
  return items
}

/**
 * Folds one run event into the transcript: `partial` text grows the current paragraph,
 * `assistant_text` finalises it, tool results attach to their call, `result` fills the footer.
 */
export function applyRunEvent(transcript: Transcript, event: AgentRunEvent): Transcript {
  if (event.seq <= transcript.lastSeq) return transcript
  const base = { ...transcript, lastSeq: event.seq }
  const key = `${event.seq}`
  const items = transcript.items
  switch (event.type) {
    case 'status':
      return { ...base, status: event.status }
    case 'init':
      return { ...base, items: [...items, { kind: 'init', key, model: event.model, sessionId: event.sessionId }] }
    case 'partial': {
      const last = items[items.length - 1]
      if (last && last.kind === 'text' && last.streaming) {
        return { ...base, items: [...items.slice(0, -1), { ...last, text: last.text + event.text }] }
      }
      return { ...base, items: [...items, { kind: 'text', key, text: event.text, streaming: true }] }
    }
    case 'assistant_text': {
      const last = items[items.length - 1]
      if (last && last.kind === 'text' && last.streaming) {
        return { ...base, items: [...items.slice(0, -1), { ...last, text: event.text, streaming: false }] }
      }
      return { ...base, items: [...items, { kind: 'text', key, text: event.text, streaming: false }] }
    }
    case 'tool_use':
      return {
        ...base,
        items: [
          ...finishStreaming(items),
          { kind: 'tool', key, toolUseId: event.id, name: event.name, input: event.input, result: null },
        ],
      }
    case 'tool_result': {
      const index = items.findLastIndex((item) => item.kind === 'tool' && item.toolUseId === event.toolUseId)
      const tool = index === -1 ? null : items[index]
      if (!tool || tool.kind !== 'tool') return base
      const next = [...items]
      next[index] = { ...tool, result: { text: event.text, isError: event.isError } }
      return { ...base, items: next }
    }
    case 'result':
      return { ...base, items: finishStreaming(items), result: event }
    case 'stderr':
      return { ...base, items: [...items, { kind: 'stderr', key, line: event.line }] }
    case 'error':
      return { ...base, items: [...finishStreaming(items), { kind: 'error', key, message: event.message }] }
  }
}
