import { anchorLabel, hashPrBody, prReviewCopyItems, type PrReviewCopyItem, type ReviewResponse } from '@review-dash/shared'
import { Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { CommentBox } from '@/components/common/CommentBox'
import { CommentList } from '@/components/common/CommentList'
import { RailSection } from '@/components/layout/RailSlot'
import { UnsavedDraftsNotice } from '@/components/submit/UnsavedDraftsNotice'
import { Button, buttonVariants } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/panel'
import { Tag } from '@/components/ui/tag'
import { apiGet, apiPost } from '@/lib/api'
import { fileRoute } from '@/lib/paths'
import { prReviewLocationUrl } from '@/lib/pr-review-links'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'
import { useCommentActions } from '@/state/useCommentActions'
import { useCurrentPrReport } from '@/components/prreview/pr-review-context'

export function PrReviewSubmitPage() {
  const { sessionId } = useSessionContext()
  const { detail, report, current } = useCurrentPrReport()
  const { state, comments, dispatch, flushSave, saveStatus, progress, resolutions, draftFor, setDraft } = useReview()
  const actions = useCommentActions()
  const [copying, setCopying] = useState<string | null>(null)
  if (!detail) return null
  const items = report ? prReviewCopyItems(report, detail.tree, state.review, resolutions) : []
  const accepted = items.filter((item) => item.source === 'proposal').length
  async function copy(item: PrReviewCopyItem) {
    if (!report || !detail) return
    setCopying(`${item.source}:${item.id}`)
    try {
      if (!await flushSave()) return
      const saved = await apiGet<ReviewResponse>(`/sessions/${encodeURIComponent(sessionId)}/review`)
      // Keep the existing checked, immutable handoff snapshot, then copy only the chosen comment.
      const snapshot = await apiPost<{ items: PrReviewCopyItem[] }>(`/sessions/${encodeURIComponent(sessionId)}/pr-review/export`, { reportRevision: hashPrBody(JSON.stringify(report)), treeFingerprint: detail.tree.fingerprint, reviewUpdatedAt: saved.review.updatedAt })
      const selected = snapshot.items.find((entry) => entry.source === item.source && entry.id === item.id)
      if (!selected || selected.body !== item.body) throw new Error('This comment changed. Review its current wording before copying.')
      try { await navigator.clipboard.writeText(selected.body); toast.success('Comment copied') }
      catch { toast.error('Clipboard unavailable. Select and copy the comment text directly.') }
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not copy comment') }
    finally { setCopying(null) }
  }
  return <main className="flex flex-1 flex-col">
    <div className="mx-auto flex w-full max-w-[1130px] flex-1 flex-col gap-[18px] px-6 pt-7 pb-14">
      <PageHeader title="Submit" />
      {!report && <Notice tone="warn">Import a review report from your agent session before copying comments.</Notice>}
      {report && !current && <Notice tone="warn">The report differs from this diff. All generated approvals are excluded until refreshed and reviewed again.</Notice>}
      <UnsavedDraftsNotice />
      <Panel>
        <PanelHeader><PanelTitle>Review summary</PanelTitle>{report && <a className={`${buttonVariants({ variant: 'primary', size: 'sm' })} ml-auto`} href={report.pr.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Open PR #{report.pr.number}</a>}</PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          <p className="m-0 text-xs text-ink-muted">{progress.reviewed} / {progress.total} files reviewed · {accepted} approved comments · {(report?.findings.length ?? 0) - accepted} proposals excluded</p>
          <p className="m-0 text-sm text-ink-muted">Open the file and lines in the PR, then copy and paste each comment.</p>
          {items.length === 0 && <p className="m-0 text-sm text-ink-muted">No comments ready to copy. Approve a suggested comment or add your own feedback in Review.</p>}
          {report && items.map((item) => {
            const humanComment = item.source === 'comment' ? comments.find((comment) => comment.id === item.id) : null
            const location = item.path ? `${item.path}${item.anchor ? ` · ${anchorLabel(item.anchor)} (${item.anchor.side} side)` : ''}` : 'Overall feedback'
            return <section key={`${item.source}:${item.id}`} aria-label={`Comment: ${item.title}`} className="flex min-w-0 flex-col gap-3 rounded-xl border-fine border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                {item.severity && <Tag tone={item.severity === 'critical' || item.severity === 'high' ? 'err' : item.severity === 'medium' ? 'warn' : 'info'}>{item.severity}</Tag>}
                {item.source === 'proposal' && <strong className="text-sm">{item.title}</strong>}
                <Button size="sm" className="ml-auto" aria-label={`Copy comment: ${item.title}`} disabled={copying !== null || saveStatus === 'error'} onClick={() => void copy(item)}><Copy aria-hidden />{copying === `${item.source}:${item.id}` ? 'Copying…' : 'Copy comment'}</Button>
              </div>
              <a href={prReviewLocationUrl(report.pr.url, item.path, item.anchor)} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 break-all font-mono text-xs font-semibold underline underline-offset-2"><ExternalLink aria-hidden className="size-3.5 shrink-0" />{location}</a>
              {humanComment ? <CommentList comments={[humanComment]} {...actions} /> : <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">{item.body}</p>}
              {item.path && <Link to={`${fileRoute(sessionId, item.path)}${item.source === 'proposal' ? `#reproduction-${encodeURIComponent(item.id)}` : ''}`} className="self-start text-xs font-semibold text-ink-muted underline underline-offset-2">{item.source === 'proposal' ? 'Wording & evidence in Review' : 'Open in Review'}</Link>}
            </section>
          })}
        </PanelBody>
      </Panel>
      <Panel><PanelHeader><PanelTitle>Overall feedback</PanelTitle></PanelHeader><PanelBody><CommentBox label="Overall feedback" draft={draftFor('overall::')} onDraftChange={(text) => setDraft('overall::', text)} pendingReject={false} onCancelReject={() => {}} onSubmit={(body) => dispatch({ type: 'ADD_COMMENT', target: { kind: 'overall', ref: null }, body })} /></PanelBody></Panel>
    </div>
    <RailSection><div className="flex flex-col gap-3 p-4 text-xs"><strong>Ready to copy</strong><span>{accepted} approved generated comments</span><span>{items.length - accepted} added comments</span><span>Open each location in the PR and paste its comment.</span><span>{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Not saved' : 'Copy-only handoff'}</span><UnsavedDraftsNotice /></div></RailSection>
  </main>
}
