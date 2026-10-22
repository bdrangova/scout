import { describe, expect, it } from 'vitest'
import { ReviewSchema } from '../schemas/review.ts'
import { SentSnapshotSchema, TestRunSentSnapshotSchema, isTestRunSent } from '../schemas/sent.ts'
import { T0, T1, T2, fp, makeComment, makeResolution, makeResolutions, makeReview } from '../testing/fixtures.ts'
import { initialReviewState, nextUnreviewedFile, reviewReducer } from './reducer.ts'
import { buildTestRunSentSnapshot, stampSent } from './sent.ts'
import { allFilesApproved, anyFileUpdated, effectiveVerdict, fileIsUpdated, isItemComment, progress, sessionStatus } from './status.ts'
import { renderTestRunSentMarkdown } from './test-run-markdown.ts'

const items = [
  { path: 's1-pass', fingerprint: fp('s1') },
  { path: 's2-fail', fingerprint: fp('s2') },
  { path: 's3-gap', fingerprint: fp('s3') },
]

describe('ReviewItem generalisation', () => {
  const review = makeReview({
    files: {
      's1-pass': { verdict: 'approved', fingerprint: fp('s1'), viewed: true },
      's2-fail': { verdict: 'rejected', fingerprint: fp('old'), viewed: true },
    },
    comments: [makeComment({ id: 'c1', target: { kind: 'scenario', ref: 's3-gap' }, body: 'unclear' })],
  })

  it('computes verdicts and progress over plain items, as an array or as {files}', () => {
    const [s1, s2] = items
    expect(effectiveVerdict(review.files['s1-pass'], s1!)).toBe('approved')
    expect(fileIsUpdated(review.files['s2-fail'], s2!)).toBe(true)
    expect(effectiveVerdict(review.files['s2-fail'], s2!)).toBe('none')
    expect(progress(review, items)).toEqual({ reviewed: 2, total: 3 })
    expect(progress(review, { files: items })).toEqual({ reviewed: 2, total: 3 })
    expect(anyFileUpdated(review, items)).toBe(true)
    expect(allFilesApproved(review, items)).toBe(false)
  })

  it('derives the session status from items', () => {
    const input = { review, tree: items, resolutions: null, activeRun: false }
    expect(sessionStatus(input)).toBe('updated')
    const fresh = makeReview({ files: { 's1-pass': review.files['s1-pass']! } })
    expect(sessionStatus({ ...input, review: fresh })).toBe('in-progress')
    expect(sessionStatus({ ...input, review: makeReview() })).toBe('unreviewed')
  })

  it('counts scenario comments like file comments', () => {
    expect(isItemComment('file')).toBe(true)
    expect(isItemComment('scenario')).toBe(true)
    for (const kind of ['overall', 'evidence', 'extra', 'spec', 'bug', 'log'] as const) expect(isItemComment(kind)).toBe(false)
  })

  it('skips commented scenarios and stores a verdict comment on the scenario target', () => {
    // s2-fail was rejected on an older fingerprint, so it comes back; s3-gap has a comment
    expect(nextUnreviewedFile(review, items)).toBe('s2-fail')
    const state = initialReviewState(makeReview())
    const next = reviewReducer(
      state,
      { type: 'SET_VERDICT', path: 's2-fail', verdict: 'rejected', fingerprint: null, comment: 'Wrong.', now: T1 },
      { files: items, itemKind: 'scenario' },
    )
    expect(next.review.files['s2-fail']).toEqual({ verdict: 'rejected', fingerprint: fp('s2'), viewed: true })
    expect(next.review.comments[0]?.target).toEqual({ kind: 'scenario', ref: 's2-fail' })
    expect(next.review.ui.currentFile).toBe('s1-pass')
  })

  it('a scenario comment resolves a pending reject', () => {
    const pending = reviewReducer(initialReviewState(makeReview()), { type: 'SET_VERDICT', path: 's1-pass', verdict: 'rejected', fingerprint: null, now: T1 }, { files: items, itemKind: 'scenario' })
    expect(pending.pendingReject).toBe('s1-pass')
    const done = reviewReducer(pending, { type: 'ADD_COMMENT', target: { kind: 'scenario', ref: 's1-pass' }, body: 'No', now: T2 }, { files: items, itemKind: 'scenario' })
    expect(done.pendingReject).toBeNull()
    expect(done.review.files['s1-pass']?.verdict).toBe('rejected')
  })
})

describe('buildTestRunSentSnapshot', () => {
  const review = makeReview({
    files: {
      's1-pass': { verdict: 'approved', fingerprint: fp('s1'), viewed: true },
      's2-fail': { verdict: 'rejected', fingerprint: fp('s2'), viewed: true },
      's3-gap': { verdict: 'approved', fingerprint: fp('stale'), viewed: true },
    },
    comments: [
      makeComment({ id: 'c1', target: { kind: 'scenario', ref: 's2-fail' }, body: 'Not a bug.', kind: 'expected-behaviour' }),
      makeComment({ id: 'c2', target: { kind: 'overall', ref: null }, body: 'Overall.' }),
      makeComment({ id: 'c3', target: { kind: 'scenario', ref: 's3-gap' }, body: 'Done.', resolvedAt: T1 }),
      makeComment({ id: 'c4', target: { kind: 'log', ref: 'run:logs/run.log', anchor: { side: 'new', line: 7 } }, body: 'Why?', kind: 'not-clear' }),
    ],
  })
  const scenarios = [
    { id: 's1-pass', title: 'Happy path', status: 'pass' as const, fingerprint: fp('s1') },
    { id: 's2-fail', title: 'Empty result', status: 'fail' as const, fingerprint: fp('s2') },
    { id: 's3-gap', title: 'Export', status: 'gap' as const, fingerprint: fp('s3') },
  ]
  const run = { path: '/repo/plans/f/a/test-runs/run-1', indexFingerprint: fp('index') }

  it('records every scenario with its effective verdict, the open comments and the counts', () => {
    const sent = buildTestRunSentSnapshot(review, scenarios, 'request-changes', null, T2, run)
    expect(TestRunSentSnapshotSchema.parse(sent)).toEqual(sent)
    expect(SentSnapshotSchema.parse(sent)).toEqual(sent)
    expect(isTestRunSent(sent)).toBe(true)
    expect(sent.scenarios.map((s) => [s.id, s.verdict])).toEqual([
      ['s1-pass', 'approved'],
      ['s2-fail', 'rejected'],
      ['s3-gap', 'none'],
    ])
    expect(sent.comments.map((c) => [c.id, c.sentAt])).toEqual([['c1', T2], ['c2', T2], ['c4', T2]])
    expect(sent.counts).toEqual({ scenarios: 3, approved: 1, rejected: 1, commented: 0, unreviewed: 1, openComments: 3 })
    expect(sent.run).toEqual(run)
    expect(sent.kind).toBe('test-run')
  })

  it('drops comments the agent resolved and counts a commented scenario without a verdict', () => {
    const sent = buildTestRunSentSnapshot(
      makeReview({ comments: [makeComment({ id: 'c1', target: { kind: 'scenario', ref: 's3-gap' }, body: 'Hm' }), makeComment({ id: 'c2', target: { kind: 'scenario', ref: 's1-pass' }, body: 'Fixed' })] }),
      scenarios,
      'undecided',
      makeResolutions({ c2: makeResolution({ at: T1 }) }),
      T2,
      { path: run.path, indexFingerprint: null },
    )
    expect(sent.comments.map((c) => c.id)).toEqual(['c1'])
    expect(sent.counts).toMatchObject({ commented: 1, unreviewed: 2, openComments: 1 })
  })

  it('is stamped onto the live review', () => {
    const sent = buildTestRunSentSnapshot(review, scenarios, 'approve', null, T2, run)
    const stamped = stampSent(review, sent, T2)
    expect(ReviewSchema.parse(stamped)).toEqual(stamped)
    expect(stamped.sent).toEqual({ at: T2, decision: 'approve' })
    expect(stamped.comments.find((c) => c.id === 'c1')?.sentAt).toBe(T2)
    expect(stamped.comments.find((c) => c.id === 'c3')?.sentAt).toBeNull()
  })

  it('renders the markdown the agent reads', () => {
    const sent = buildTestRunSentSnapshot(
      makeReview({
        files: review.files,
        comments: [
          ...review.comments.slice(0, 2),
          makeComment({ id: 'c5', target: { kind: 'scenario', ref: 's2-fail' }, body: 'Line one\nline two', kind: 'incorrect', timestampSec: 65 }),
          makeComment({ id: 'c6', target: { kind: 'bug', ref: 'x' }, body: 'Close it.' }),
          review.comments[3]!,
        ],
      }),
      scenarios,
      'request-changes',
      null,
      T2,
      run,
    )
    const md = renderTestRunSentMarkdown(sent, {
      title: 'Demo feature test run',
      dashboardUrl: 'http://127.0.0.1:4546/',
      index: { bugs: [{ slug: 'x', title: 'Empty result shows an error', path: 'bugs:x/x.md', screenshots: [], scenarios: [] }], logs: [{ path: 'run:logs/run.log', label: 'Run log' }] },
    })
    expect(md).toBe(`# Test review feedback — Demo feature test run (20260926-1830-add-trial-bar-3f2a)
Sent: ${T2} · Decision: **REQUEST CHANGES** · Dashboard: http://127.0.0.1:4546/t/20260926-1830-add-trial-bar-3f2a/review
Run: \`/repo/plans/f/a/test-runs/run-1\`

## Overall
- [c2] Overall.

## Scenarios (1 rejected, 1 approved, 0 commented, 1 not reviewed)
### s1-pass · Happy path
Verdict: **APPROVED** · Status: pass
### s2-fail · Empty result
Verdict: **REJECTED** · Status: fail
- [c1] **[expected-behaviour]** Not a bug.
- [c5] at 1:05 **[incorrect]** Line one
  > line two

## Bugs
### x — Empty result shows an error
- [c6] Close it.

## Logs
### run:logs/run.log — Run log
- [c4] run:logs/run.log:7 **[not-clear]** Why?

## Required response
Address every open comment by changing the code in the working tree; the dashboard reads it live, there is nothing to publish. For each comment run \`ai-review resolve 20260926-1830-add-trial-bar-3f2a --comment c<n> --status resolved --note "…"\` (or \`--status open --note "…"\` to reply without resolving).
`)
  })

  it('omits empty sections', () => {
    const sent = buildTestRunSentSnapshot(makeReview(), scenarios, 'approve', null, T0, run)
    const md = renderTestRunSentMarkdown(sent, { title: 'T', dashboardUrl: 'http://x', index: {} })
    expect(md).not.toContain('## Scenarios')
    expect(md).not.toContain('## Overall')
    expect(md).toContain('## Required response')
  })
  it('lists a comment on a screenshot under the scenario that holds it, and strays under Files', () => {
    const review = makeReview({
      comments: [
        makeComment({ id: 'c1', target: { kind: 'run-file', ref: 'run:scenarios/s2/01.png' }, kind: 'incorrect', body: 'Wrong colour.' }),
        makeComment({ id: 'c2', target: { kind: 'run-file', ref: 'run:gone.png' }, body: 'Lost.' }),
      ],
    })
    const sent = buildTestRunSentSnapshot(review, scenarios, 'request-changes', null, T0, run)
    const md = renderTestRunSentMarkdown(sent, {
      title: 'T',
      dashboardUrl: 'http://x',
      index: { scenarios: [{ id: scenarios[1]!.id, evidence: { videos: [], screenshots: [{ path: 'run:scenarios/s2/01.png' }], data: [] } }] },
    })
    expect(md).toContain(`### ${scenarios[1]!.id} · `)
    expect(md).toContain('- [c1] `run:scenarios/s2/01.png` **[incorrect]** Wrong colour.')
    expect(md).toContain('## Files\n- [c2] `run:gone.png` Lost.')
  })
})
