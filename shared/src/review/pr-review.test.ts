import { describe, it, expect } from 'vitest'
import { PrReviewReportSchema } from '../schemas/pr-review.ts'
import { ReviewSchema } from '../schemas/review.ts'
import { makePrReport } from '../testing/pr-review.ts'
import { makeTree, makeReview, makeComment, T1 } from '../testing/fixtures.ts'
import { approvedProposals, currentProposal, proposalDigest, renderPrReviewMarkdown, reportMatchesTree } from './pr-review.ts'
import { reviewReducer, initialReviewState } from './reducer.ts'

const tree = makeTree({ dirty: false })
const report = makePrReport(tree)
const finding = report.findings[0]!
function approved() { return makeReview({ prProposals: { f1: { ...currentProposal(report, finding, makeReview()), body: 'Exact edited wording', verdict: 'approved', notes: [{ body: 'private note', createdAt: T1 }] } } }) }
describe('PR review contract and export', () => {
  it('keeps complete changed files without requiring findings for every file', () => {
    expect(PrReviewReportSchema.parse(report).files).toHaveLength(3)
    expect(PrReviewReportSchema.parse({ ...report, findings: [] }).findings).toEqual([])
  })
  it('rejects invalid paths, duplicates, missing verification and dangling evidence links', () => {
    expect(PrReviewReportSchema.safeParse({ ...report, files: [{ ...report.files[0], path: '../secret' }] }).success).toBe(false)
    expect(PrReviewReportSchema.safeParse({ ...report, findings: [finding, finding] }).success).toBe(false)
    for (const reproduction of [{ ...finding.reproduction, status: 'reproduced' }, { ...finding.reproduction, limitation: null }, { ...finding.reproduction, status: 'non-visual' }]) {
      expect(PrReviewReportSchema.safeParse({ ...report, findings: [{ ...finding, reproduction }] }).success).toBe(false)
    }
  })
  it('persists proposal state independently and never advances or approves the file', () => {
    const before = initialReviewState(makeReview())
    const proposal = approved().prProposals!.f1!
    const after = reviewReducer(before, { type: 'SET_PROPOSAL', id: 'f1', proposal, now: T1 }, { files: tree.files })
    expect(after.review.files).toEqual(before.review.files)
    expect(after.review.ui).toEqual(before.review.ui)
    expect(after.atEnd).toBe(false)
    expect(ReviewSchema.parse(after.review).prProposals?.f1).toEqual(proposal)
  })
  it('invalidates approvals after changed evidence, wording, reviewer version or revisions', () => {
    expect(approvedProposals(report, tree, approved())).toHaveLength(1)
    for (const changed of [
      { ...report, headSha: 'c'.repeat(40) },
      { ...report, reviewers: [{ name: 'default-code-review', version: '2' }] },
      { ...report, findings: [{ ...finding, body: 'Changed suggested text' }] },
      { ...report, findings: [{ ...finding, reproduction: { ...finding.reproduction, actual: 'A new outcome' } }] },
    ]) expect(approvedProposals(changed, tree, approved())).toEqual([])
    expect(approvedProposals(report, { ...tree, files: tree.files.map((f) => ({ ...f, fingerprint: 'f'.repeat(16) })) }, approved())).toEqual([])
    expect(reportMatchesTree(report, { ...tree, files: tree.files.slice(1) })).toBe(false)
    expect(proposalDigest(report, finding)).toHaveLength(64)
  })
  it('exports exact accepted wording, added comments, all verdicts and limits, excluding notes and other proposals', () => {
    const pending = { ...finding, id: 'pending', body: 'Do not export pending' }
    const rejected = { ...finding, id: 'rejected', body: 'Do not export rejected' }
    const source = { ...report, findings: [finding, pending, rejected] }
    const review = approved()
    review.comments = [makeComment({ body: 'Human line comment', target: { kind: 'file', ref: tree.files[1]!.path, anchor: { side: 'old', line: 2, endLine: 4 } } })]
    review.prProposals!.rejected = { ...currentProposal(source, rejected, review), verdict: 'rejected' }
    const md = renderPrReviewMarkdown(source, tree, review, 'Review')
    expect(md).toContain('Exact edited wording')
    expect(md).toContain('Human line comment')
    expect(md).toContain('old lines 2–4')
    expect(md).toContain('Payment credentials are unavailable.')
    for (const file of tree.files) expect(md).toContain(`${file.path}: pending`)
    for (const excluded of ['private note', pending.body, rejected.body]) expect(md).not.toContain(excluded)
  })
})
