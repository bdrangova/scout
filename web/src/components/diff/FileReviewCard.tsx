import { effectiveVerdict, entriesForFile, fileIsUpdated, fileSummary, type CommentTarget, type LineAnchor, type TreeFile } from '@scout/shared'
import { useCallback, useEffect, useMemo, useReducer, useState, type PointerEvent } from 'react'
import { CommentBox } from '@/components/common/CommentBox'
import { CommentList } from '@/components/common/CommentList'
import { ReplyChip } from '@/components/journal/JournalParts'
import { ScoutNotesStrip } from '@/components/journal/ScoutNotesStrip'
import { PrFooterGroup } from '@/components/prcomments/PrFooterGroup'
import type { JournalReply } from '@/lib/journal-view'
import { fileTypeClass, fileTypeOf } from '@/lib/file-type'
import { isMarkdownPath, splitPath } from '@/lib/paths'
import type { ScopeReview } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { useJournalState } from '@/state/journal-context'
import { useReview } from '@/state/review-context'
import { usePrComments } from '@/state/pr-comments-context'
import { useCommentActions } from '@/state/useCommentActions'
import { ProposalAnnotationsContext } from '@/components/prreview/proposal-annotations'
import { ReproductionEvidence } from '@/components/prreview/ReproductionEvidence'
import { ProposalCard } from '@/components/prreview/ProposalCard'
import { useCurrentPrReport } from '@/components/prreview/pr-review-context'
import { CardActions } from './CardActions'
import { CardHeader, type CardView } from './CardHeader'
import { JournalAnnotationsContext, type JournalAnnotationsValue } from './journal-annotations'
import { LargeFileGate } from './LargeFileGate'
import { LineCommentsContext, type LineCommentsValue } from './line-comments'
import { MarkdownPreview } from './MarkdownPreview'
import { PrAnnotationsContext, type PrAnnotationsValue } from './pr-annotations'
import { useVerdictAction } from './useVerdictAction'
import { VerdictOverlay } from './VerdictOverlay'

export interface FileReviewCardProps {
  file: TreeFile
  sessionId: string
  /** `8 / 12` in the header. */
  position?: { index: number; total: number }
  /** Highlighted (scroll mode's current card). */
  active?: boolean
  /** Bump to focus this card's comment box (the `C` hotkey). */
  commentFocusToken?: number
  /** Swipe mode starts the drag from the header so the diff keeps its own scroll and selection. */
  onHeaderPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  className?: string
  /** Classes for the scrolling diff area (e.g. a max height in scroll mode). */
  bodyClassName?: string
  /**
   * The card shows one scope's change of the file (its patch comes from the scope routes) while
   * the review state stays the full diff's: verdicts are read from and pinned to `fullFile(path)`.
   */
  scope?: ScopeReview
}

const DIFF_VIEWS: readonly CardView[] = ['unified', 'split']
const MARKDOWN_VIEWS: readonly CardView[] = [...DIFF_VIEWS, 'preview']
const NO_VIEWS: readonly CardView[] = []

/** How long the "changed just now" pulse stays on the header after the file moved on disk. */
export const CHANGED_PULSE_MS = 2500

/** Header + diff + comments + verdict buttons; reads and dispatches through `useReview()`. */
export function FileReviewCard({
  file,
  sessionId,
  position,
  active = false,
  commentFocusToken = 0,
  onHeaderPointerDown,
  className,
  bodyClassName,
  scope,
}: FileReviewCardProps) {
  const { report } = useCurrentPrReport()
  const findings = useMemo(() => report?.findings.filter((f) => f.path === file.path) ?? [], [report, file.path])
  const { state, dispatch, fileReview, commentsFor, draftFor, setDraft } = useReview()
  const sendVerdict = useVerdictAction()
  const commentActions = useCommentActions()
  const [view, setView] = useState<CardView>('unified')
  const inlineFindings = scope || view === 'preview' || file.binary || file.omitted ? [] : findings
  const [localFocus, bumpLocalFocus] = useReducer((count: number) => count + 1, 0)
  const { name } = splitPath(file.path)
  const target = useMemo<CommentTarget>(() => ({ kind: 'file', ref: file.path }), [file.path])
  // Every comment on the file; the anchored ones render inside the diff, the rest in the footer.
  const comments = commentsFor(target)
  const fileComments = useMemo(() => comments.filter((comment) => comment.target.anchor === undefined), [comments])
  const review = fileReview(file.path)
  // GitHub threads on the file: the diff hangs them under their lines and reports which it placed; the footer lists the rest.
  const { threadsFor, fileCounts } = usePrComments()
  const prThreads = useMemo(() => threadsFor(file.path), [threadsFor, file.path])
  const [placedIds, setPlacedIds] = useState<readonly string[]>([])
  const onPlaced = useCallback(
    (ids: readonly string[]) => setPlacedIds((previous) => (previous.length === ids.length && previous.every((id, index) => id === ids[index]) ? previous : ids)),
    [],
  )
  const prAnnotations = useMemo<PrAnnotationsValue | null>(() => (prThreads.length > 0 ? { threads: prThreads, onPlaced } : null), [prThreads, onPlaced])
  const footerThreads = useMemo(() => prThreads.filter((thread) => !placedIds.includes(thread.root.id)), [prThreads, placedIds])
  const pendingReject = state.pendingReject === file.path
  // Scout's notes: the summary and the file-level/stale ones in the strip, the anchored ones in the diff (it reports which it placed).
  const { journal } = useJournalState()
  const journalEntries = useMemo(() => entriesForFile(journal, file.path), [journal, file.path])
  const summary = useMemo(() => fileSummary(journal, file.path), [journal, file.path])
  const anchoredEntries = useMemo(() => journalEntries.filter((entry) => entry.anchor !== undefined), [journalEntries])
  const [placedJournal, setPlacedJournal] = useState<readonly string[] | null>(null)
  const onJournalPlaced = useCallback(
    (ids: readonly string[]) => setPlacedJournal((previous) => (previous !== null && previous.length === ids.length && previous.every((id, index) => id === ids[index]) ? previous : ids)),
    [],
  )
  const journalAnnotations = useMemo<JournalAnnotationsValue | null>(() => (anchoredEntries.length > 0 ? { entries: anchoredEntries, onPlaced: onJournalPlaced } : null), [anchoredEntries, onJournalPlaced])
  const diffExpected = view !== 'preview' && !file.binary && !file.omitted && !file.collapsed
  const stripOthers = useMemo(
    () => journalEntries.filter((entry) => entry.kind !== 'summary' && (entry.anchor === undefined || (placedJournal === null ? !diffExpected : !placedJournal.includes(entry.id)))),
    [journalEntries, placedJournal, diffExpected],
  )
  // Replying to a file-level or stale note: a file comment with the chip above the box.
  const [fileReply, setFileReply] = useState<JournalReply | null>(null)
  // Kept in the review state (not the comment box) so Approve and Reject send what is typed instead of dropping it.
  const draft = draftFor(file.path)
  const draftBody = draft.trim()
  // The file the review state belongs to: in a scope the full diff's entry of the same path.
  const reviewFile = scope ? scope.fullFile(file.path) : file
  const reviewable = reviewFile !== null
  const updated = reviewFile !== null && fileIsUpdated(review, reviewFile)
  // A verdict pinned to an older fingerprint of a file that changed since no longer counts.
  const verdict = reviewFile === null ? 'none' : effectiveVerdict(review, reviewFile)
  const previewable = isMarkdownPath(file.path) && !file.binary && !file.omitted
  // No layout to choose for a file with no text diff (binary, omitted).
  const views = previewable ? MARKDOWN_VIEWS : file.binary || file.omitted ? NO_VIEWS : DIFF_VIEWS

  // The file's content moved on disk while this card was mounted: pulse the header briefly
  // (the diff itself refetches through the fingerprint in `useFilePatch`'s key).
  const [seenFingerprint, setSeenFingerprint] = useState(file.fingerprint)
  const [changedJustNow, setChangedJustNow] = useState(false)
  if (seenFingerprint !== file.fingerprint) {
    setSeenFingerprint(file.fingerprint)
    setChangedJustNow(true)
  }
  useEffect(() => {
    if (!changedJustNow) return
    const timer = window.setTimeout(() => setChangedJustNow(false), CHANGED_PULSE_MS)
    return () => window.clearTimeout(timer)
  }, [changedJustNow, seenFingerprint])

  function setVerdict(next: 'approved' | 'rejected') {
    if (reviewFile === null) return
    const clearing = next === verdict
    const withComment = sendVerdict(file.path, next, reviewFile.fingerprint)
    // A reject without a comment waits for one; with one it is final, like an approve.
    if (!clearing && (next === 'approved' || withComment)) scope?.advanceFrom(file.path)
  }

  function addComment(body: string) {
    dispatch({ type: 'ADD_COMMENT', target, body, ...(fileReply && { about: fileReply.id }) })
    setFileReply(null)
    if (body.trim() !== '') scope?.advanceFrom(file.path)
  }

  const lineComments = useMemo<LineCommentsValue | null>(
    () =>
      reviewable
        ? {
            comments: comments.filter((comment) => comment.target.anchor !== undefined),
            onAdd: (anchor: LineAnchor, body: string, about?: string) => dispatch({ type: 'ADD_COMMENT', target: { ...target, anchor }, body, ...(about !== undefined && { about }) }),
            ...commentActions,
          }
        : null,
    [reviewable, comments, dispatch, target, commentActions],
  )

  return (
    <article
      aria-label={file.path}
      data-path={file.path}
      data-active={active || undefined}
      data-verdict={verdict}
      data-changed={changedJustNow || undefined}
      className={cn(
        fileTypeClass(fileTypeOf(file.path).id),
        'relative flex flex-col overflow-hidden rounded-2xl border-fine border-line bg-surface text-ink transition-[border-color]',
        active && 'border-ink',
        pendingReject && 'border-red',
        className,
      )}
    >
      <VerdictOverlay verdict={verdict} commented={comments.some((comment) => comment.status === 'open')} pendingReject={pendingReject} />

      <CardHeader
        file={file}
        position={position}
        updated={updated}
        prComments={fileCounts.get(file.path)}
        changedJustNow={changedJustNow}
        view={view}
        views={views}
        onViewChange={setView}
        onPointerDown={onHeaderPointerDown}
      />

      <ScoutNotesStrip
        sessionId={sessionId}
        summary={summary}
        others={stripOthers}
        onReply={reviewable ? (reply) => { setFileReply(reply); bumpLocalFocus() } : undefined}
      />

      <div className={cn('min-h-0 flex-1 overflow-auto bg-code', bodyClassName)}>
        {view === 'preview' && previewable ? (
          <MarkdownPreview file={file} sessionId={sessionId} scope={scope?.scope ?? null} />
        ) : (
          <LineCommentsContext.Provider value={lineComments}>
            <PrAnnotationsContext.Provider value={prAnnotations}>
              <JournalAnnotationsContext.Provider value={journalAnnotations}>
              <ProposalAnnotationsContext.Provider value={inlineFindings}>
              <LargeFileGate
                file={file}
                sessionId={sessionId}
                scope={scope?.scope ?? null}
                diffStyle={view === 'preview' ? 'unified' : view}
                onApprove={reviewable ? () => setVerdict('approved') : undefined}
              />
              </ProposalAnnotationsContext.Provider>
              </JournalAnnotationsContext.Provider>
            </PrAnnotationsContext.Provider>
          </LineCommentsContext.Provider>
        )}
        {findings.length > 0 && inlineFindings.length === 0 && <div className="flex flex-col gap-3 bg-surface p-4">{findings.map((f) => <ProposalCard key={f.id} finding={f} changed={!!scope} />)}</div>}
        {findings.length > 0 && <ReproductionEvidence findings={findings} />}
      </div>

      <section aria-label={`Comments on ${file.path}`} className="flex shrink-0 flex-col gap-3 border-t-fine border-line bg-surface px-4 pt-3.5 pb-4">
        {!reviewable && (
          <p className="text-xs text-ink-muted">No net change: a later change undid this one.</p>
        )}
        <PrFooterGroup threads={footerThreads} path={file.path} />
        <CommentList comments={fileComments} {...commentActions} />
        {reviewable && fileReply && <ReplyChip reply={fileReply} onCancel={() => setFileReply(null)} />}
        {reviewable && (
          <CommentBox
            label={pendingReject ? `Why reject ${name}?` : `Comment on ${name}`}
            pendingReject={pendingReject}
            collapsible
            focusToken={localFocus + commentFocusToken}
            draft={draft}
            onDraftChange={(text) => setDraft(file.path, text)}
            onSubmit={addComment}
            onCancelReject={() => dispatch({ type: 'CANCEL_REJECT' })}
          />
        )}
        <CardActions
          verdict={verdict}
          pendingReject={pendingReject}
          reviewable={reviewable}
          hasDraft={draftBody !== ''}
          onApprove={() => setVerdict('approved')}
          onReject={() => (pendingReject && draftBody === '' ? dispatch({ type: 'CANCEL_REJECT' }) : setVerdict('rejected'))}
          onComment={bumpLocalFocus}
        />
      </section>
    </article>
  )
}
