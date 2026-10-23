import type { PrFinding, PrReviewReport } from '../schemas/pr-review.ts'
import type { ProposalReview, Review } from '../schemas/review.ts'
import type { WorkingTree } from '../schemas/tree.ts'
import { hashPrBody } from './sha256.ts'
import type { Resolutions } from '../schemas/resolutions.ts'
import { mergeComments, effectiveVerdict } from './status.ts'
import { anchorLabel } from './line-anchor.ts'

/** Pins wording, evidence bytes, reviewer versions and the exact reviewed diff/revisions. */
export function proposalDigest(report: PrReviewReport, finding: PrFinding): string {
  return hashPrBody(JSON.stringify({ base: report.baseSha, head: report.headSha, reviewers: report.reviewers, file: report.files.find((f) => f.path === finding.path), finding }))
}
export function reportMatchesTree(report: PrReviewReport, tree: WorkingTree): boolean {
  return report.baseSha === tree.baseSha && report.headSha === tree.headSha && report.files.length === tree.files.length && report.files.every((f) => tree.files.some((t) => t.path === f.path && t.fingerprint === f.fingerprint))
}
export function currentProposal(report: PrReviewReport, finding: PrFinding, review: Review): ProposalReview {
  const stored = review.prProposals?.[finding.id]
  if (stored?.digest === proposalDigest(report, finding)) return stored
  return { digest: proposalDigest(report, finding), body: stored?.body ?? finding.body, verdict: 'none', notes: stored?.notes ?? [], updatedAt: report.createdAt }
}
export function approvedProposals(report: PrReviewReport, tree: WorkingTree, review: Review): PrFinding[] {
  if (!reportMatchesTree(report, tree)) return []
  return report.findings.filter((f) => { const p = currentProposal(report, f, review); return p.verdict === 'approved' && p.body.trim() !== '' })
}

/** Exact, copyable handoff. Never includes private notes, unadded drafts or pending/rejected/stale proposals. */
export function renderPrReviewMarkdown(report: PrReviewReport, tree: WorkingTree, review: Review, title: string, resolutions: Resolutions | null = null): string {
  const accepted = approvedProposals(report, tree, review)
  const lines = [`# ${title}`, '', `PR: ${report.pr.url}`, `Report: ${report.id}`, `Reviewed revision: ${report.baseSha}..${report.headSha}`, `Current revision: ${tree.baseSha}..${tree.headSha}`, '', '## File decisions', '']
  for (const file of tree.files) lines.push(`- ${file.path}: ${effectiveVerdict(review.files[file.path], file) === 'none' ? 'pending' : effectiveVerdict(review.files[file.path], file)}`)
  lines.push('', '## Approved review comments', '', `${accepted.length} included; ${report.findings.length - accepted.length} pending, rejected or stale proposals excluded.`, '')
  if (!reportMatchesTree(report, tree)) lines.push('Report differs from the current diff. Refresh the report and review proposals again.', '')
  for (const f of accepted) {
    const r = f.reproduction
    lines.push(`### [${f.severity}] ${f.title}`, `${f.path} · ${anchorLabel(f.anchor)} (${f.anchor.side} side)`, '', currentProposal(report, f, review).body, '', `Verification: ${r.status}`, `Environment: ${r.environment}`, `Revision: ${r.revision}`, '')
    for (const pre of r.prerequisites) lines.push(`- Prerequisite: ${pre}`)
    r.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.instruction}`))
    lines.push('', `Expected: ${r.expected}`, `Actual: ${r.actual}`)
    if (r.limitation) lines.push(`Limitation: ${r.limitation}`)
    for (const e of r.evidence) lines.push(`- ${e.kind}: ${e.caption} (step ${e.stepId}) — attach ${e.path}; captured ${e.capturedAt}, revision ${e.revision}`)
    lines.push('')
  }
  lines.push('## Added comments', '')
  for (const c of mergeComments(review, resolutions).filter((c) => c.status === 'open')) {
    lines.push(`### ${c.target.ref ?? 'Overall'}${c.target.anchor ? ` · ${anchorLabel(c.target.anchor)} (${c.target.anchor.side} side)` : ''}`, '', c.body, '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** Keep the existing lifecycle vocabulary while accounting for independent proposal decisions. */
export function prReviewSessionStatus(status: import('./status.ts').SessionStatus, report: PrReviewReport | null | undefined, tree: WorkingTree, review: Review | null): import('./status.ts').SessionStatus {
  if (!report) return status === 'ready' ? 'in-progress' : status
  if (!reportMatchesTree(report, tree)) return 'updated'
  const proposals = report.findings.map((f) => review ? currentProposal(report, f, review).verdict : 'none')
  if (status === 'ready' && proposals.some((v) => v === 'none')) return 'in-progress'
  if (status === 'unreviewed' && proposals.some((v) => v !== 'none')) return 'in-progress'
  return status
}

export interface PrReviewCopyItem {
  id: string
  source: 'proposal' | 'comment'
  title: string
  body: string
  path: string | null
  anchor?: import('../schemas/review.ts').LineAnchor
  severity?: PrFinding['severity']
}

/** Only approved current proposals and explicitly added open human feedback are ready to paste. */
export function prReviewCopyItems(report: PrReviewReport, tree: WorkingTree, review: Review, resolutions: Resolutions | null = null): PrReviewCopyItem[] {
  return [
    ...approvedProposals(report, tree, review).map((finding): PrReviewCopyItem => ({
      id: finding.id, source: 'proposal', title: finding.title, severity: finding.severity,
      body: currentProposal(report, finding, review).body, path: finding.path, anchor: finding.anchor,
    })),
    ...mergeComments(review, resolutions).filter((comment) => comment.status === 'open').map((comment): PrReviewCopyItem => ({
      id: comment.id, source: 'comment', title: comment.target.ref ?? 'Overall feedback', body: comment.body,
      path: comment.target.kind === 'file' ? comment.target.ref : null, anchor: comment.target.anchor,
    })),
  ]
}
