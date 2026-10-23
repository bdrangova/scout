import { currentProposal, anchorLabel, type PrFinding, type ProposalReview } from '@review-dash/shared'
import { useState } from 'react'
import { CommentBox } from '@/components/common/CommentBox'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { Textarea } from '@/components/ui/textarea'
import { Notice } from '@/components/ui/notice'
import { fileRoute } from '@/lib/paths'
import { useReview } from '@/state/review-context'
import { useCurrentPrReport } from './pr-review-context'

/** Independent proposal actions: they never dispatch a file verdict or advance the deck. */
export function ProposalCard({ finding, changed = false }: { finding: PrFinding; changed?: boolean }) {
  const { detail, report, current } = useCurrentPrReport()
  const { state, dispatch, draftFor, setDraft } = useReview()
  const [noteOpen, setNoteOpen] = useState(false)
  if (!report || !detail) return null
  const proposal = currentProposal(report, finding, state.review)
  const outdated = changed || !current
  const key = `proposal::${finding.id}`
  function update(patch: Partial<ProposalReview>) {
    const next = { ...proposal, ...patch, updatedAt: new Date().toISOString() }
    dispatch({ type: 'SET_PROPOSAL', id: finding.id, proposal: next })
  }
  return <section aria-label={`Suggested comment: ${finding.title}`} data-proposal-id={finding.id} className="flex flex-col gap-2 font-sans text-[13px] leading-normal text-ink">
    <div className="flex flex-wrap items-center gap-2">
      <Tag tone={finding.severity === 'critical' || finding.severity === 'high' ? 'err' : finding.severity === 'medium' ? 'warn' : 'info'}>{finding.severity}</Tag>
      <strong>{finding.title}</strong>
      <Tag tone={proposal.verdict === 'approved' && !outdated ? 'ok' : proposal.verdict === 'rejected' ? 'err' : 'neutral'}>{outdated ? 'Changed · needs refresh' : proposal.verdict === 'none' ? 'Pending' : proposal.verdict}</Tag>
    </div>
    <span className="text-xs text-ink-muted">{anchorLabel(finding.anchor)} · {finding.sources.join(' → ')}</span>
    {outdated && <Notice tone="warn">The report or anchor differs from this diff. Refresh the report before approving this comment.</Notice>}
    <Textarea aria-label={`Recommended comment for ${finding.id}`} value={proposal.body} onChange={(e) => update({ body: e.target.value, verdict: 'none' })} />
    <div className="flex flex-wrap gap-2">
      <Button size="sm" aria-pressed={proposal.verdict === 'approved' && !outdated} variant={proposal.verdict === 'approved' && !outdated ? 'approve' : 'default'} disabled={outdated || !proposal.body.trim()} onClick={() => update({ verdict: proposal.verdict === 'approved' ? 'none' : 'approved' })}>Approve comment</Button>
      <Button size="sm" aria-pressed={proposal.verdict === 'rejected'} variant={proposal.verdict === 'rejected' ? 'reject' : 'default'} onClick={() => update({ verdict: proposal.verdict === 'rejected' ? 'none' : 'rejected' })}>Reject comment</Button>
      <Button size="sm" variant="ghost" onClick={() => setNoteOpen((open) => !open)}>Comment on suggestion</Button>
      <Button size="sm" variant="ghost" onClick={() => update({ body: finding.body, verdict: 'none' })}>Reset wording</Button>
      <a href={`${fileRoute(detail.manifest.id, finding.path)}#reproduction-${encodeURIComponent(finding.id)}`} className="self-center text-xs font-semibold underline underline-offset-2">Reproduction & evidence</a>
    </div>
    {proposal.notes.map((note, i) => <p key={i} className="m-0 whitespace-pre-wrap text-xs text-ink-muted">Reviewer note (excluded from PR summary): {note.body}</p>)}
    {(noteOpen || draftFor(key)) && <CommentBox label="Note for the reviewer agent (excluded from PR summary)" pendingReject={false} onCancelReject={() => {}} draft={draftFor(key)} onDraftChange={(text) => setDraft(key, text)} onSubmit={(body) => update({ notes: [...proposal.notes, { body, createdAt: new Date().toISOString() }] })} />}
  </section>
}
