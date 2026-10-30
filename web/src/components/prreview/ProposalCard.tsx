import { anchorLabel, type PrFinding } from '@scout/shared'
import { useState } from 'react'
import { CommentBox } from '@/components/common/CommentBox'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { Textarea } from '@/components/ui/textarea'
import { Notice } from '@/components/ui/notice'
import { fileRoute } from '@/lib/paths'
import { useReview } from '@/state/review-context'
import { useCurrentPrReport } from './pr-review-context'
import { useProposal } from './useProposal'

export interface ProposalCardProps {
  finding: PrFinding
  changed?: boolean
  /** Drop the title line and the link to the reproduction (the Evidence page's card already shows both). */
  bare?: boolean
}

/** Independent proposal actions: they never dispatch a file verdict or advance the deck. */
export function ProposalCard({ finding, changed = false, bare = false }: ProposalCardProps) {
  const { detail } = useCurrentPrReport()
  const { draftFor, setDraft } = useReview()
  const [noteOpen, setNoteOpen] = useState(false)
  const state = useProposal(finding, changed)
  if (!state || !detail) return null
  const { proposal, outdated, update, toggleApprove, toggleReject } = state
  const key = `proposal::${finding.id}`
  const status = <Tag tone={proposal.verdict === 'approved' && !outdated ? 'ok' : proposal.verdict === 'rejected' ? 'err' : 'neutral'}>{outdated ? 'Changed · needs refresh' : proposal.verdict === 'none' ? 'Pending' : proposal.verdict}</Tag>
  return <section aria-label={`Suggested comment: ${finding.title}`} data-proposal-id={finding.id} className="flex flex-col gap-2 font-sans text-[13px] leading-normal text-ink">
    {bare ? <div className="flex items-center gap-2"><strong className="text-xs">Suggested PR comment</strong>{status}</div> : <>
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={finding.severity === 'critical' || finding.severity === 'high' ? 'err' : finding.severity === 'medium' ? 'warn' : 'info'}>{finding.severity}</Tag>
        <strong>{finding.title}</strong>
        {status}
      </div>
      <span className="text-xs text-ink-muted">{anchorLabel(finding.anchor)} · {finding.sources.join(' → ')}</span>
    </>}
    {outdated && <Notice tone="warn">Report differs from this diff. Refresh before approving.</Notice>}
    <Textarea aria-label={`Recommended comment for ${finding.id}`} value={proposal.body} onChange={(e) => update({ body: e.target.value, verdict: 'none' })} />
    <div className="flex flex-wrap gap-2">
      <Button size="sm" aria-pressed={proposal.verdict === 'approved' && !outdated} variant={proposal.verdict === 'approved' && !outdated ? 'approve' : 'default'} disabled={outdated || !proposal.body.trim()} onClick={toggleApprove}>Approve comment</Button>
      <Button size="sm" aria-pressed={proposal.verdict === 'rejected'} variant={proposal.verdict === 'rejected' ? 'reject' : 'default'} onClick={toggleReject}>Reject comment</Button>
      <Button size="sm" variant="ghost" onClick={() => setNoteOpen((open) => !open)}>Comment on suggestion</Button>
      <Button size="sm" variant="ghost" onClick={() => update({ body: finding.body, verdict: 'none' })}>Reset wording</Button>
      {!bare && <a href={`${fileRoute(detail.manifest.id, finding.path)}#reproduction-${encodeURIComponent(finding.id)}`} className="self-center text-xs font-semibold underline underline-offset-2">Reproduction & evidence</a>}
    </div>
    {proposal.notes.map((note, i) => <p key={i} className="m-0 whitespace-pre-wrap text-xs text-ink-muted">Reviewer note (excluded from PR summary): {note.body}</p>)}
    {(noteOpen || draftFor(key)) && <CommentBox label="Note for the reviewer agent (excluded from PR summary)" pendingReject={false} onCancelReject={() => {}} draft={draftFor(key)} onDraftChange={(text) => setDraft(key, text)} onSubmit={(body) => update({ notes: [...proposal.notes, { body, createdAt: new Date().toISOString() }] })} />}
  </section>
}
