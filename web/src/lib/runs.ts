/** API calls and pure helpers for Submit. */
import type { Decision, SendResponse } from '@scout/shared'
import { ApiRequestError, apiPost } from './api'

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

export function sendReview(sessionId: string, decision: Decision): Promise<SendResponse> {
  return apiPost<SendResponse>(`${sessionPath(sessionId)}/review/send`, { decision })
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
