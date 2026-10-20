import { Bot, CircleAlert, CircleCheck, CircleDashed, ClipboardCheck, ListChecks, RefreshCw, Send, type LucideIcon } from 'lucide-react'
import type { AgentRunStatus, FileStatus, SessionStatus, Verdict } from '@review-dash/shared'

/** The five status colours: ok=--st-a, warn=--st-m, info=--st-r, err=--st-d, neutral=muted ink. */
export type Tone = 'ok' | 'warn' | 'info' | 'err' | 'neutral'

export interface ToneSpec {
  tone: Tone
  label: string
  /** Something is happening right now (agent working, run in flight). */
  pulse: boolean
}

/** One hue per lifecycle state (the `--st-<hue>` tokens); the legacy `tone` stays for dots and text that only know five tones. */
export type SessionHue = 'awaiting' | 'progress' | 'ready' | 'changes' | 'working' | 'updated' | 'approved' | 'failed'

export interface SessionToneSpec extends ToneSpec {
  hue: SessionHue
  /** Own shape per state so colour is never the only signal. */
  icon: LucideIcon
  /** Text/icon colour of the state (>= 4.5:1 on paper). */
  textClass: string
  /** Dot / bar fill of the state. */
  fillClass: string
  /** Tinted pill: tint, full-strength border, round icon disc with a paper glyph. Approved is solid, Ready outlined. */
  noticeClass: string
}

const DISC = '[&_[data-slot=notice-icon]]:text-paper'

function sessionSpec(hue: SessionHue, tone: Tone, label: string, icon: LucideIcon, pulse = false): SessionToneSpec {
  const surface: Record<SessionHue, string> = {
    awaiting: 'bg-st-awaiting-bg border-st-awaiting [--n-ic:var(--st-awaiting)]',
    progress: 'bg-st-progress-bg border-st-progress [--n-ic:var(--st-progress)]',
    ready: 'bg-transparent border-st-ready [--n-ic:var(--st-ready)]',
    changes: 'bg-st-changes-bg border-st-changes [--n-ic:var(--st-changes)]',
    working: 'bg-st-working-bg border-st-working [--n-ic:var(--st-working)]',
    updated: 'bg-st-updated-bg border-st-updated [--n-ic:var(--st-updated)]',
    approved: 'bg-st-approved border-st-approved text-paper [--n-ic:var(--paper)] [&_[data-slot=notice-icon]]:text-st-approved',
    failed: 'bg-st-failed-bg border-st-failed [--n-ic:var(--st-failed)]',
  }
  const text: Record<SessionHue, string> = {
    awaiting: 'text-st-awaiting',
    progress: 'text-st-progress',
    ready: 'text-st-ready',
    changes: 'text-st-changes',
    working: 'text-st-working',
    updated: 'text-st-updated',
    approved: 'text-st-approved',
    failed: 'text-st-failed',
  }
  const fill: Record<SessionHue, string> = {
    awaiting: 'bg-st-awaiting',
    progress: 'bg-st-progress',
    ready: 'bg-st-ready',
    changes: 'bg-st-changes',
    working: 'bg-st-working',
    updated: 'bg-st-updated',
    approved: 'bg-st-approved',
    failed: 'bg-st-failed',
  }
  return {
    tone,
    label,
    pulse,
    hue,
    icon,
    textClass: text[hue],
    fillClass: fill[hue],
    noticeClass: hue === 'approved' ? surface[hue] : `${surface[hue]} ${DISC}`,
  }
}

/**
 * The review lifecycle, one meaning each: Awaiting review, In progress, Ready to submit (all files
 * reviewed, nothing sent), Changes sent (a decision went to the agent; Approve only ever makes
 * Approved), Updated since sent (re-review), Approved (Approve sent, nothing changed). Agent working
 * and Run failed are not review states: they are the run chips shown beside the review pill.
 */
const SESSION: Record<SessionStatus, SessionToneSpec> = {
  unreviewed: sessionSpec('awaiting', 'neutral', 'Awaiting review', CircleDashed),
  'in-progress': sessionSpec('progress', 'info', 'In progress', ListChecks),
  ready: sessionSpec('ready', 'ok', 'Ready to submit', ClipboardCheck),
  sent: sessionSpec('changes', 'neutral', 'Changes sent', Send),
  'agent-working': sessionSpec('working', 'info', 'Agent working', Bot, true),
  'run-failed': sessionSpec('failed', 'err', 'Run failed', CircleAlert),
  updated: sessionSpec('updated', 'warn', 'Updated since sent', RefreshCw),
  approved: sessionSpec('approved', 'ok', 'Approved', CircleCheck),
}

const FILE: Record<FileStatus, ToneSpec> = {
  added: { tone: 'ok', label: 'Added', pulse: false },
  modified: { tone: 'warn', label: 'Modified', pulse: false },
  deleted: { tone: 'err', label: 'Deleted', pulse: false },
  renamed: { tone: 'info', label: 'Renamed', pulse: false },
  copied: { tone: 'info', label: 'Copied', pulse: false },
  typechange: { tone: 'neutral', label: 'Type change', pulse: false },
}

const RUN: Record<AgentRunStatus, ToneSpec> = {
  queued: { tone: 'neutral', label: 'Queued', pulse: true },
  running: { tone: 'info', label: 'Running', pulse: true },
  succeeded: { tone: 'ok', label: 'Succeeded', pulse: false },
  failed: { tone: 'err', label: 'Failed', pulse: false },
  cancelled: { tone: 'neutral', label: 'Cancelled', pulse: false },
}

const VERDICT: Record<Verdict, ToneSpec> = {
  none: { tone: 'neutral', label: 'Not reviewed', pulse: false },
  approved: { tone: 'ok', label: 'Approved', pulse: false },
  rejected: { tone: 'err', label: 'Changes requested', pulse: false },
}

/** One place for "what colour is this state": session, file, run and verdict all resolve to a `Tone`. */
export const STATUS_TONE = {
  session: (status: SessionStatus): SessionToneSpec => SESSION[status],
  file: (status: FileStatus): ToneSpec => FILE[status],
  run: (status: AgentRunStatus): ToneSpec => RUN[status],
  verdict: (verdict: Verdict): ToneSpec => VERDICT[verdict],
} as const

/** Text class for a tone. */
export const TONE_TEXT_CLASS: Record<Tone, string> = {
  ok: 'text-st-a',
  warn: 'text-st-m',
  info: 'text-st-r',
  err: 'text-st-d',
  neutral: 'text-ink-muted',
}
