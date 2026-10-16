import { describe, expect, it } from 'vitest'
import { SESSION_ID, T0, T1, fp, makeComment, makeEvidence, makeExtra, makeManifest, makeResolution, makeResolutions, makeReview, makeSpec, makeTree } from '../testing/fixtures.ts'
import type { AgentRun, AgentRunEvent } from './agent.ts'
import { AgentRunEventSchema, AgentRunSchema } from './agent.ts'
import type { Health, SessionDetail, SessionSummary, StoreEvent } from './api.ts'
import {
  ApiErrorSchema,
  HealthSchema,
  PutReviewRequestSchema,
  ReviewResponseSchema,
  SendRequestSchema,
  SendResponseSchema,
  SessionDetailSchema,
  SessionListItemSchema,
  SessionSummarySchema,
  StartRunRequestSchema,
  StoreEventSchema,
} from './api.ts'
import { EvidenceIndexSchema, ExtrasIndexSchema, SpecIndexSchema } from './artifacts.ts'
import { CommitListSchema, ScopeSchema } from './commits.ts'
import { ManifestSchema } from './manifest.ts'
import { ResolutionsSchema } from './resolutions.ts'
import { CommentTargetSchema, ModeSchema, ReviewSchema, emptyReview } from './review.ts'
import type { SentSnapshot } from './sent.ts'
import { SentSnapshotSchema } from './sent.ts'
import { WorkingTreeSchema } from './tree.ts'

const RUN_ID = 'run-20260926190000-9c1d'

const agentRun: AgentRun = {
  id: RUN_ID,
  sessionId: SESSION_ID,
  sentAt: T1,
  adapter: 'fake',
  status: 'running',
  pid: 4242,
  argv: ['claude', '-p', `/apply-review ${SESSION_ID}`],
  startedAt: T1,
  endedAt: null,
  exitCode: null,
  agentSessionId: 'agent-session-1',
  numTurns: null,
  costUsd: null,
  resultText: null,
  error: null,
  resolvedComments: [],
}

const sentSnapshot: SentSnapshot = {
  schemaVersion: 2,
  sessionId: SESSION_ID,
  sentAt: T1,
  decision: 'request-changes',
  tree: { baseSha: 'b'.repeat(40), headSha: 'a'.repeat(40), branch: 'feature/trial-bar' },
  patchPath: 'review/sent/2026-09-26T19-00-00.000Z.patch',
  files: [{ path: 'src/a.tsx', verdict: 'rejected', fingerprint: fp('src/a.tsx'), status: 'modified', additions: 10, deletions: 2 }],
  comments: [makeComment({ sentAt: T1 })],
  counts: { files: 3, approved: 0, rejected: 1, commented: 0, unreviewed: 2, openComments: 1 },
}

describe('schemas accept a valid example of each shape', () => {
  it('Manifest', () => {
    expect(ManifestSchema.parse(makeManifest())).toEqual(makeManifest())
  })

  it('WorkingTree', () => {
    const tree = makeTree()
    expect(WorkingTreeSchema.parse(tree)).toEqual(tree)
  })

  it('artifact indexes', () => {
    expect(EvidenceIndexSchema.parse({ items: [{ file: 'a.png', caption: 'A' }] }).items).toHaveLength(1)
    expect(ExtrasIndexSchema.parse({ items: [{ file: 'a.md', order: 2 }] }).items).toHaveLength(1)
    expect(SpecIndexSchema.parse({ items: [{ file: 'jira.md', type: 'jira', url: 'https://x', capturedAt: T0 }] }).items).toHaveLength(1)
    expect(SpecIndexSchema.safeParse({ items: [{ file: 'x.md', type: 'pdf' }] }).success).toBe(false)
  })

  it('Review and emptyReview', () => {
    const r = makeReview({ comments: [makeComment()] })
    expect(ReviewSchema.parse(r)).toEqual(r)
    expect(ReviewSchema.parse(emptyReview(SESSION_ID, T0)).nextCommentId).toBe(1)
    expect(ReviewSchema.parse(emptyReview(SESSION_ID, T0)).schemaVersion).toBe(2)
  })

  it('CommentTarget pairs kind and ref', () => {
    expect(CommentTargetSchema.parse({ kind: 'overall', ref: null })).toEqual({ kind: 'overall', ref: null })
    expect(CommentTargetSchema.parse({ kind: 'spec', ref: 'jira.md' })).toEqual({ kind: 'spec', ref: 'jira.md' })
    expect(CommentTargetSchema.safeParse({ kind: 'overall', ref: 'x' }).success).toBe(false)
    expect(CommentTargetSchema.safeParse({ kind: 'file', ref: null }).success).toBe(false)
  })

  it('Resolutions', () => {
    const rs = makeResolutions({ c1: makeResolution() })
    expect(ResolutionsSchema.parse(rs)).toEqual(rs)
  })

  it('SentSnapshot', () => {
    expect(SentSnapshotSchema.parse(sentSnapshot)).toEqual(sentSnapshot)
  })

  it('AgentRun and every AgentRunEvent variant', () => {
    expect(AgentRunSchema.parse(agentRun)).toEqual(agentRun)
    const events: AgentRunEvent[] = [
      { seq: 0, at: T1, type: 'status', status: 'running' },
      { seq: 1, at: T1, type: 'init', model: 'claude-sonnet-4-5', sessionId: 'agent-session-1' },
      { seq: 2, at: T1, type: 'partial', text: 'Looking at' },
      { seq: 3, at: T1, type: 'assistant_text', text: 'Looking at the comments.' },
      { seq: 4, at: T1, type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ai-review feedback' } },
      { seq: 5, at: T1, type: 'tool_result', toolUseId: 'toolu_1', text: '# Review feedback', isError: false },
      { seq: 6, at: T1, type: 'stderr', line: 'warning: something' },
      { seq: 7, at: T1, type: 'error', message: 'boom' },
      { seq: 8, at: T1, type: 'result', isError: false, text: 'Done', costUsd: 0.42, numTurns: 7, durationMs: 12000 },
    ]
    for (const event of events) expect(AgentRunEventSchema.parse(event)).toEqual(event)
  })

  it('api responses and requests', () => {
    const health: Health = { ok: true, home: '/Users/me/.ai-review', adapter: 'claude-code', claudeBin: null }
    expect(HealthSchema.parse(health)).toEqual(health)

    const m = makeManifest()
    const tree = makeTree()
    const summary: SessionSummary = {
      id: m.id,
      title: m.title,
      repo: { path: m.repo.path, branch: tree.branch, baseRef: m.repo.baseRef },
      tickets: m.tickets,
      status: 'in-progress',
      progress: { reviewed: 1, total: 3 },
      openComments: 1,
      stats: { files: 3, additions: 20, deletions: 6 },
      updatedAt: m.updatedAt,
      activeRunId: null,
    }
    expect(SessionSummarySchema.parse(summary)).toEqual(summary)
    expect(SessionListItemSchema.parse(summary)).toEqual(summary)
    expect(SessionListItemSchema.parse({ id: 'broken', error: 'invalid manifest' })).toEqual({ id: 'broken', error: 'invalid manifest' })

    const detail: SessionDetail = {
      manifest: m,
      tree,
      evidence: [makeEvidence()],
      extras: [makeExtra()],
      spec: [makeSpec()],
      prDescription: '# PR',
      status: 'unreviewed',
      progress: { reviewed: 0, total: 3 },
      activeRunId: RUN_ID,
    }
    expect(SessionDetailSchema.parse(detail)).toEqual(detail)

    const r = makeReview({ comments: [makeComment()] })
    const reviewResponse = { review: r, resolutions: null, comments: [{ ...makeComment(), status: 'open', resolution: null }] }
    expect(ReviewResponseSchema.parse(reviewResponse)).toEqual(reviewResponse)
    expect(PutReviewRequestSchema.parse({ review: r, baseUpdatedAt: null }).baseUpdatedAt).toBeNull()
    expect(SendRequestSchema.parse({ decision: 'approve', dispatch: true }).dispatch).toBe(true)
    const sendResponse = { sent: sentSnapshot, run: agentRun, pending: null }
    expect(SendResponseSchema.parse(sendResponse)).toEqual(sendResponse)
    expect(StartRunRequestSchema.parse({})).toEqual({})
    expect(StartRunRequestSchema.parse({ fork: true })).toEqual({ fork: true })

    const events: StoreEvent[] = [
      { type: 'run.updated', sessionId: SESSION_ID, runId: RUN_ID },
      { type: 'session.updated', sessionId: SESSION_ID },
      { type: 'tree.updated', sessionId: SESSION_ID, fingerprint: tree.fingerprint, durationMs: 120 },
    ]
    for (const event of events) expect(StoreEventSchema.parse(event)).toEqual(event)
    expect(StoreEventSchema.safeParse({ type: 'run.updated', sessionId: SESSION_ID }).success).toBe(false)
    expect(ApiErrorSchema.parse({ error: 'too large', isLarge: true })).toEqual({ error: 'too large', isLarge: true })
  })
})

describe('schemas reject invalid data', () => {
  it('rejects a bad session id', () => {
    expect(ManifestSchema.safeParse(makeManifest({ id: 'not-a-session-id' })).success).toBe(false)
    expect(ManifestSchema.safeParse(makeManifest({ id: '20260926-1830-Add_Trial-3f2a' })).success).toBe(false)
    expect(ReviewSchema.safeParse(makeReview({ sessionId: 'nope' })).success).toBe(false)
  })

  it('rejects schema version 1 documents', () => {
    expect(ManifestSchema.safeParse({ ...makeManifest(), schemaVersion: 1 }).success).toBe(false)
    expect(ReviewSchema.safeParse({ ...makeReview(), schemaVersion: 1 }).success).toBe(false)
  })

  it('rejects a bad fingerprint', () => {
    const tree = makeTree()
    expect(WorkingTreeSchema.safeParse({ ...tree, fingerprint: 'abc' }).success).toBe(false)
    expect(ReviewSchema.safeParse(makeReview({ files: { 'a.ts': { verdict: 'approved', fingerprint: 'ABC', viewed: true } } })).success).toBe(false)
  })

  it('rejects a bad nextCommentId', () => {
    expect(ReviewSchema.safeParse(makeReview({ nextCommentId: -1 })).success).toBe(false)
    expect(ReviewSchema.safeParse(makeReview({ nextCommentId: 0 })).success).toBe(false)
    expect(ReviewSchema.safeParse(makeReview({ comments: [makeComment({ id: 'c3' })], nextCommentId: 3 })).success).toBe(false)
  })

  it('rejects a bad comment id key in resolutions', () => {
    expect(ResolutionsSchema.safeParse(makeResolutions({ x1: makeResolution() })).success).toBe(false)
  })
})

describe('commits schemas', () => {
  const sha = 'a'.repeat(40)
  const commit = {
    sha,
    shortSha: 'aaaaaaa',
    subject: 'Fix the nav',
    author: 'Bojana',
    authoredAt: '2026-10-16T10:00:00.000Z',
    parents: ['b'.repeat(40)],
    merge: false,
    pushed: true,
    stats: { files: 2, additions: 10, deletions: 1 },
  }

  it('accepts a commit list with and without a remote ref', () => {
    const base = {
      baseRef: 'origin/main',
      baseSha: 'b'.repeat(40),
      headSha: sha,
      branch: 'feature/nav',
      commits: [commit],
      uncommitted: null,
      fingerprint: '0123456789abcdef',
    }
    expect(CommitListSchema.parse({ ...base, remote: { ref: 'origin/feature/nav', ahead: 0, behind: 0 } }).commits).toHaveLength(1)
    expect(CommitListSchema.parse({ ...base, remote: { ref: null, ahead: 1, behind: 0 }, uncommitted: { files: 1, additions: 2, deletions: 0 } }).remote.ref).toBeNull()
  })

  it('accepts only the uncommitted scope or a commit sha as a scope', () => {
    expect(ScopeSchema.safeParse('uncommitted').success).toBe(true)
    expect(ScopeSchema.safeParse(sha).success).toBe(true)
    expect(ScopeSchema.safeParse('HEAD').success).toBe(false)
    expect(ScopeSchema.safeParse('abc123').success).toBe(false)
  })

  it('knows the grid mode', () => {
    expect(ModeSchema.parse('grid')).toBe('grid')
  })
})
