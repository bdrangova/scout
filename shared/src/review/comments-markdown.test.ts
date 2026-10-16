import { describe, expect, it } from 'vitest'
import { T1, T2, fp, makeComment, makeEvidence, makeExtra, makeResolution, makeResolutions, makeReview, makeSpec, makeTree, makeTreeFile } from '../testing/fixtures.ts'
import { renderSentMarkdown } from './comments-markdown.ts'
import { buildSentSnapshot } from './sent.ts'

const DASHBOARD = 'http://127.0.0.1:4546'

const tree = makeTree({
  files: ['src/a.tsx', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts'].map((path) => makeTreeFile({ path })),
})
const ctx = {
  title: 'Add trial bar',
  dashboardUrl: `${DASHBOARD}/`,
  evidence: [makeEvidence(), makeEvidence({ path: 'flow.webm', type: 'video', caption: 'Checkout flow', order: 1 })],
  extras: [makeExtra(), makeExtra({ path: 'report.html', type: 'html', title: 'Report' })],
  spec: [makeSpec()],
}

describe('renderSentMarkdown', () => {
  it('renders every section in the contract layout', () => {
    const r = makeReview({
      files: {
        'src/a.tsx': { verdict: 'rejected', fingerprint: fp('src/a.tsx'), viewed: true },
        'src/c.ts': { verdict: 'approved', fingerprint: fp('src/c.ts'), viewed: true },
        'src/d.ts': { verdict: 'approved', fingerprint: fp('src/d.ts'), viewed: true },
      },
      comments: [
        makeComment({ id: 'c1', target: { kind: 'file', ref: 'src/a.tsx' }, body: 'Do not swallow the error.\n\nRethrow it, or log it with the request id.' }),
        makeComment({ id: 'c2', target: { kind: 'file', ref: 'src/b.ts' }, body: 'Nit: rename `foo` to `bar`.' }),
        makeComment({ id: 'c3', target: { kind: 'evidence', ref: 'flow.webm' }, body: 'The spinner never stops here.', timestampSec: 42.7 }),
        makeComment({ id: 'c4', target: { kind: 'file', ref: 'src/c.ts' }, body: 'Fine, but add a test.' }),
        makeComment({ id: 'c5', target: { kind: 'extra', ref: 'architecture.md' }, body: 'The diagram is missing the worker.' }),
        makeComment({ id: 'c6', target: { kind: 'overall', ref: null }, body: 'Good direction. Fix the error handling before merging.' }),
        makeComment({ id: 'c7', target: { kind: 'evidence', ref: 'trial-bar.png' }, body: 'Already fixed.' }),
        makeComment({ id: 'c8', target: { kind: 'evidence', ref: 'trial-bar.png' }, body: 'Second look.', timestampSec: 3661 }),
        makeComment({ id: 'c9', target: { kind: 'extra', ref: 'report.html' }, body: 'Report says "done" but tests are red.' }),
        makeComment({ id: 'c10', target: { kind: 'spec', ref: 'jira.md' }, body: 'The ticket asks for a dismiss button too.' }),
        makeComment({ id: 'c11', target: { kind: 'extra', ref: 'removed.md' }, body: 'This one is gone from disk.' }),
      ],
    })
    const sent = buildSentSnapshot({
      review: r,
      tree,
      decision: 'request-changes',
      resolutions: makeResolutions({ c7: makeResolution({ at: T1 }) }),
      now: T2,
    })
    expect(renderSentMarkdown(sent, ctx)).toMatchInlineSnapshot(`
      "# Review feedback — Add trial bar (20260926-1830-add-trial-bar-3f2a)
      Sent: 2026-09-26T19:30:00.000Z · Decision: **REQUEST CHANGES** · Dashboard: http://127.0.0.1:4546/s/20260926-1830-add-trial-bar-3f2a
      Tree: feature/trial-bar @ aaaaaaaaaaaa (base bbbbbbbbbbbb) · Diff: \`review/sent/2026-09-26T19-30-00.000Z.patch\`

      ## Overall
      - [c6] > Good direction. Fix the error handling before merging.

      ## Files (1 rejected, 2 approved, 1 commented, 1 not reviewed)
      ### src/a.tsx — REJECTED
      - [c1] > Do not swallow the error.
        >
        > Rethrow it, or log it with the request id.
      ### src/b.ts — commented
      - [c2] > Nit: rename \`foo\` to \`bar\`.
      ### src/c.ts — approved
      - [c4] > Fine, but add a test.

      ## Evidence
      ### trial-bar.png — Trial bar on the dashboard
      - [c8] at 61:01 > Second look.
      ### flow.webm — Checkout flow
      - [c3] at 0:42 > The spinner never stops here.

      ## Spec
      ### jira.md — QI-15472 Trial bar
      - [c10] > The ticket asks for a dismiss button too.

      ## Extras
      ### architecture.md — Architecture
      - [c5] > The diagram is missing the worker.
      ### report.html — Report
      - [c9] > Report says "done" but tests are red.
      ### removed.md
      - [c11] > This one is gone from disk.

      ## Required response
      Address every open comment by changing the code in the working tree; the dashboard reads it live, there is nothing to publish. For each comment run \`ai-review resolve 20260926-1830-add-trial-bar-3f2a --comment c<n> --status resolved --note "…"\` (or \`--status open --note "…"\` to reply without resolving). The exact diff the reviewer saw is in \`review/sent/2026-09-26T19-30-00.000Z.patch\` (relative to the session folder).
      "
    `)
  })

  it('omits every empty section when only an overall comment was left', () => {
    const r = makeReview({ comments: [makeComment({ id: 'c1', target: { kind: 'overall', ref: null }, body: 'Ship it.' })] })
    const sent = buildSentSnapshot({ review: r, tree, decision: 'approve', resolutions: null, now: T2 })
    expect(renderSentMarkdown(sent, { title: 'Add trial bar', dashboardUrl: DASHBOARD })).toMatchInlineSnapshot(`
      "# Review feedback — Add trial bar (20260926-1830-add-trial-bar-3f2a)
      Sent: 2026-09-26T19:30:00.000Z · Decision: **APPROVE** · Dashboard: http://127.0.0.1:4546/s/20260926-1830-add-trial-bar-3f2a
      Tree: feature/trial-bar @ aaaaaaaaaaaa (base bbbbbbbbbbbb) · Diff: \`review/sent/2026-09-26T19-30-00.000Z.patch\`

      ## Overall
      - [c1] > Ship it.

      ## Required response
      Address every open comment by changing the code in the working tree; the dashboard reads it live, there is nothing to publish. For each comment run \`ai-review resolve 20260926-1830-add-trial-bar-3f2a --comment c<n> --status resolved --note "…"\` (or \`--status open --note "…"\` to reply without resolving). The exact diff the reviewer saw is in \`review/sent/2026-09-26T19-30-00.000Z.patch\` (relative to the session folder).
      "
    `)
  })

  it('is deterministic and ends with exactly one newline', () => {
    const r = makeReview({ comments: [makeComment({ id: 'c1', target: { kind: 'overall', ref: null }, body: 'Ship it.' })] })
    const sent = buildSentSnapshot({ review: r, tree: makeTree({ branch: null }), decision: 'approve', resolutions: null, now: T2 })
    const first = renderSentMarkdown(sent, { title: 'T', dashboardUrl: DASHBOARD })
    expect(renderSentMarkdown(sent, { title: 'T', dashboardUrl: DASHBOARD })).toBe(first)
    expect(first).toContain('Tree: detached @')
    expect(first.endsWith('\n')).toBe(true)
    expect(first.endsWith('\n\n')).toBe(false)
    expect(first).not.toContain('\r')
  })
})
