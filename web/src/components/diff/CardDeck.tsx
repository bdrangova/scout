import { effectiveVerdict, type TreeFile, type Verdict } from '@review-dash/shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { fileTypeClass, fileTypeOf } from '@/lib/file-type'
import type { ScopeReview } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { useReview } from '@/state/review-context'
import { PEEK_COUNT, PEEK_INSET, PEEK_RISE, useExitDirection, type ExitDirection } from './deck-motion'
import { NavButton, SwipeFrame } from './DeckParts'
import { FileReviewCard } from './FileReviewCard'
import { useVerdictAction } from './useVerdictAction'

export interface CardDeckProps {
  files: readonly TreeFile[]
  currentPath: string
  sessionId: string
  onNavigate: (path: string) => void
  /** Bump to focus the current card's comment box. */
  commentFocusToken?: number
  /** Set when `files` are one scope's files: verdicts are read from and pinned to the full diff. */
  scope?: ScopeReview
}

export function CardDeck({ files, currentPath, sessionId, onNavigate, commentFocusToken = 0, scope }: CardDeckProps) {
  const { fileReview, commentsFor } = useReview()
  const sendVerdict = useVerdictAction()
  const foundIndex = files.findIndex((file) => file.path === currentPath)
  const index = foundIndex === -1 ? 0 : foundIndex
  const current = files[index]

  /** The file a verdict is pinned to: in a scope the full diff's entry of the path (null without one). */
  function reviewFileOf(path: string): TreeFile | null {
    const file = files.find((candidate) => candidate.path === path) ?? null
    return scope ? scope.fullFile(path) : file
  }

  function signatureOf(path: string): { verdict: Verdict; openComments: number } {
    const file = reviewFileOf(path)
    return {
      // A card that left the tree keeps its stored verdict for the fly-off direction.
      verdict: file ? effectiveVerdict(fileReview(path), file) : (fileReview(path)?.verdict ?? 'none'),
      openComments: commentsFor({ kind: 'file', ref: path }).filter((comment) => comment.status === 'open').length,
    }
  }

  const exitDirection = useExitDirection(currentPath, signatureOf)

  function commit(direction: 'left' | 'right') {
    if (!current) return
    const reviewFile = reviewFileOf(current.path)
    if (!reviewFile) return
    const withComment = sendVerdict(current.path, direction === 'right' ? 'approved' : 'rejected', reviewFile.fingerprint)
    if (direction === 'right' || withComment) scope?.advanceFrom(current.path)
  }

  function step(delta: number) {
    const next = files[index + delta]
    if (next) onNavigate(next.path)
  }

  return (
    <div className="flex min-h-0 flex-1 items-stretch justify-center gap-3 px-4 pt-11 pb-5 md:gap-5 md:px-7">
      <NavButton label="Previous file" disabled={index === 0} onClick={() => step(-1)}>
        <ChevronLeft aria-hidden />
      </NavButton>

      <div className="flex w-full max-w-[1200px] min-w-0 flex-1 flex-col gap-3">
        <div className="relative flex min-h-[560px] flex-1">
          {/* The next files in the queue show as layers behind the card, in their type's colour. */}
          {Array.from({ length: PEEK_COUNT }, (_, i) => PEEK_COUNT - i).map((offset) => {
            const peek = files[index + offset]
            if (!peek) return null
            return (
              <div
                key={peek.path}
                aria-hidden
                data-slot="deck-peek"
                className={cn(fileTypeClass(fileTypeOf(peek.path).id), 'absolute h-11 rounded-3xl border-fine border-fill-line bg-ft')}
                style={{ left: PEEK_INSET * offset, right: PEEK_INSET * offset, top: -PEEK_RISE * offset }}
              />
            )
          })}
          <AnimatePresence initial={false} custom={exitDirection}>
            {current && (
              <SwipeCard
                key={current.path}
                file={current}
                sessionId={sessionId}
                position={{ index, total: files.length }}
                exitDirection={exitDirection}
                commentFocusToken={commentFocusToken}
                scope={scope}
                onCommit={commit}
              />
            )}
          </AnimatePresence>
        </div>
        <p className="text-center text-[12.5px] font-semibold text-ink-muted tabular-nums" aria-live="polite">
          {index + 1} / {files.length}
        </p>
      </div>

      <NavButton label="Next file" disabled={index >= files.length - 1} onClick={() => step(1)}>
        <ChevronRight aria-hidden />
      </NavButton>
    </div>
  )
}

interface SwipeCardProps {
  file: TreeFile
  sessionId: string
  position: { index: number; total: number }
  exitDirection: ExitDirection
  commentFocusToken: number
  scope: ScopeReview | undefined
  onCommit: (direction: 'left' | 'right') => void
}

/** The swipe frame around one file card; a drag from the header commits a verdict. */
function SwipeCard({ file, sessionId, position, exitDirection, commentFocusToken, scope, onCommit }: SwipeCardProps) {
  return (
    <SwipeFrame exitDirection={exitDirection} onCommit={onCommit}>
      {(startDrag) => (
        <FileReviewCard
          file={file}
          sessionId={sessionId}
          position={position}
          commentFocusToken={commentFocusToken}
          scope={scope}
          onHeaderPointerDown={startDrag}
          className="h-full"
        />
      )}
    </SwipeFrame>
  )
}
