import { effectiveVerdict, fileIsUpdated, type CommentTarget, type TreeFile } from '@review-dash/shared'
import { Check, MessageSquare, X } from 'lucide-react'
import { useEffect, useMemo, useReducer, useState, type PointerEvent } from 'react'
import { CommentBox } from '@/components/common/CommentBox'
import { CommentList } from '@/components/common/CommentList'
import { Button } from '@/components/ui/button'
import { BINARY_BADGE, UNTRACKED_BADGE, fileStatusBadge } from '@/lib/file-status'
import { formatAdditions, formatDeletions } from '@/lib/format'
import { isMarkdownPath, splitPath } from '@/lib/paths'
import type { ScopeReview } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { useReview } from '@/state/review-context'
import type { DiffStyle } from './FileDiffView'
import { LargeFileGate } from './LargeFileGate'
import { MarkdownPreview } from './MarkdownPreview'
import { VerdictOverlay } from './VerdictOverlay'

export interface FileReviewCardProps {
  file: TreeFile
  sessionId: string
  /** `file 3 of 12` in the header. */
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

/** What the card body shows: one of the diff layouts, or the rendered markdown of a `.md` file. */
type CardView = DiffStyle | 'preview'

const DIFF_VIEWS: readonly CardView[] = ['unified', 'split']
const MARKDOWN_VIEWS: readonly CardView[] = [...DIFF_VIEWS, 'preview']

/** How long the "changed just now" pulse stays on the header after the file moved on disk. */
export const CHANGED_PULSE_MS = 2500

const CHIP_CLASS = 'inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase'

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
  const { state, dispatch, fileReview, commentsFor, draftFor, setDraft, setVerdict: sendVerdict } = useReview()
  const [view, setView] = useState<CardView>('unified')
  const [localFocus, bumpLocalFocus] = useReducer((count: number) => count + 1, 0)
  const { dir, name } = splitPath(file.path)
  const badge = fileStatusBadge(file)
  const target = useMemo<CommentTarget>(() => ({ kind: 'file', ref: file.path }), [file.path])
  const comments = commentsFor(target)
  const review = fileReview(file.path)
  const pendingReject = state.pendingReject === file.path
  // Kept in the review state (not the comment box) so Approve and Reject send what is typed instead of dropping it.
  const draft = draftFor(file.path)
  const draftBody = draft.trim()
  // The file the review state belongs to: in a scope the full diff's entry of the same path.
  const reviewFile = scope ? scope.fullFile(file.path) : file
  const reviewable = reviewFile !== null
  const updated = reviewFile !== null && fileIsUpdated(review, reviewFile)
  // A verdict pinned to an older fingerprint of a file that changed since no longer counts.
  const verdict = reviewFile === null ? 'none' : effectiveVerdict(review, reviewFile)
  const renamedFrom = file.oldPath !== null && file.oldPath !== file.path ? file.oldPath : null
  const previewable = isMarkdownPath(file.path) && !file.binary && !file.omitted
  const views = previewable ? MARKDOWN_VIEWS : DIFF_VIEWS

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
    const withComment = sendVerdict(file.path, next, reviewFile.fingerprint)
    // A reject without a comment waits for one; with one it is final, like an approve.
    if (next === 'approved' || withComment) scope?.advanceFrom(file.path)
  }

  function addComment(body: string) {
    dispatch({ type: 'ADD_COMMENT', target, body })
    if (body.trim() !== '') scope?.advanceFrom(file.path)
  }

  return (
    <article
      aria-label={file.path}
      data-path={file.path}
      data-active={active || undefined}
      data-verdict={verdict}
      data-changed={changedJustNow || undefined}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[0_10px_28px_rgba(27,26,23,0.08)] transition-shadow',
        active && 'border-foreground/40 ring-2 ring-foreground/15',
        pendingReject && 'border-reject',
        className,
      )}
    >
      <VerdictOverlay
        verdict={verdict}
        commented={comments.some((comment) => comment.status === 'open')}
        pendingReject={pendingReject}
      />

      <div
        className={cn(
          'flex shrink-0 items-start gap-3 border-b px-5 py-3 transition-colors duration-700',
          changedJustNow && 'bg-warn/15',
          onHeaderPointerDown && 'cursor-grab select-none',
        )}
        style={onHeaderPointerDown ? { touchAction: 'none' } : undefined}
        onPointerDown={onHeaderPointerDown}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {dir && (
            // `dir="rtl"` keeps the end of a long path visible: the leading folders are what gets cut.
            <span className="truncate text-left font-mono text-xs text-muted-foreground" dir="rtl" title={dir}>
              <bdi>{dir}</bdi>
            </span>
          )}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate font-mono text-sm font-semibold" title={file.path}>
              {name}
            </span>
            <span className={cn(CHIP_CLASS, badge.className)}>{badge.label}</span>
            {file.binary && <span className={cn(CHIP_CLASS, BINARY_BADGE.className)}>{BINARY_BADGE.label}</span>}
            {file.untracked && (
              <span className={cn(CHIP_CLASS, UNTRACKED_BADGE.className)} title="Not yet added to git">
                {UNTRACKED_BADGE.label}
              </span>
            )}
            {updated && (
              <span className={cn(CHIP_CLASS, 'bg-warn/15 text-warn-foreground')} title="Changed on disk since you reviewed it">
                updated
              </span>
            )}
            {changedJustNow && (
              <span role="status" className={cn(CHIP_CLASS, 'animate-pulse bg-warn text-white')}>
                changed just now
              </span>
            )}
          </span>
          {renamedFrom && (
            <span className="truncate font-mono text-xs text-muted-foreground" title={renamedFrom}>
              renamed from {renamedFrom}
            </span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-2 self-start pt-0.5">
          <span className="text-[13px] font-semibold text-approve tabular-nums whitespace-nowrap">{formatAdditions(file.additions)}</span>
          <span className="text-[13px] font-semibold text-reject tabular-nums whitespace-nowrap">{formatDeletions(file.deletions)}</span>
          {position && (
            <span className="pl-1 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              file {position.index + 1} of {position.total}
            </span>
          )}
          <div role="group" aria-label="Diff layout" className="ml-1 flex overflow-hidden rounded-md border text-xs whitespace-nowrap">
            {views.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  'h-7 shrink-0 px-2 font-semibold capitalize transition',
                  view === option ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </span>
      </div>

      <div className={cn('min-h-0 flex-1 overflow-auto', bodyClassName)}>
        {view === 'preview' && previewable ? (
          <MarkdownPreview file={file} sessionId={sessionId} scope={scope?.scope ?? null} />
        ) : (
          <LargeFileGate
            file={file}
            sessionId={sessionId}
            scope={scope?.scope ?? null}
            diffStyle={view === 'preview' ? 'unified' : view}
            onApprove={reviewable ? () => setVerdict('approved') : undefined}
          />
        )}
      </div>

      <section aria-label={`Comments on ${file.path}`} className="flex shrink-0 flex-col gap-3 border-t bg-background/60 px-5 py-3">
        {!reviewable && (
          <p className="text-xs text-muted-foreground">No net change in the full diff: a later change undid this one, so it cannot be reviewed here.</p>
        )}
        <CommentList
          comments={comments}
          onEdit={(id, body) => dispatch({ type: 'EDIT_COMMENT', id, body })}
          onDelete={(id) => dispatch({ type: 'DELETE_COMMENT', id })}
          onResolve={(id) => dispatch({ type: 'RESOLVE_COMMENT', id })}
          onReopen={(id) => dispatch({ type: 'REOPEN_COMMENT', id })}
        />
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
      </section>

      <footer className="flex shrink-0 items-center gap-3 border-t bg-muted/40 px-5 py-3">
        {draftBody === '' ? (
          <span className="hidden text-xs text-muted-foreground sm:inline">A approve · X reject · C comment</span>
        ) : (
          <span className="text-xs text-muted-foreground">Your comment is sent with the verdict.</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!reviewable}
            aria-pressed={verdict === 'rejected' || pendingReject}
            onClick={() => (pendingReject && draftBody === '' ? dispatch({ type: 'CANCEL_REJECT' }) : setVerdict('rejected'))}
            className={cn(
              'border-reject/50 text-reject hover:bg-reject/10 hover:text-reject',
              (verdict === 'rejected' || pendingReject) && 'bg-reject text-white hover:bg-reject/90 hover:text-white',
            )}
          >
            <X data-icon="inline-start" aria-hidden />
            Reject
          </Button>
          <Button variant="outline" disabled={!reviewable} onClick={bumpLocalFocus}>
            <MessageSquare data-icon="inline-start" aria-hidden />
            Comment
          </Button>
          <Button
            disabled={!reviewable}
            aria-pressed={verdict === 'approved'}
            onClick={() => setVerdict('approved')}
            className={cn(
              'border-approve/50 bg-card text-approve hover:bg-approve/10',
              verdict === 'approved' && 'bg-approve text-white hover:bg-approve/90',
            )}
          >
            <Check data-icon="inline-start" aria-hidden />
            Approve
          </Button>
        </div>
      </footer>
    </article>
  )
}
