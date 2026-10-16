import { effectiveVerdict, type TreeFile, type Verdict } from '@review-dash/shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { useState, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { ScopeReview } from '@/lib/scope'
import { useReview } from '@/state/review-context'
import { FileReviewCard } from './FileReviewCard'

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

type ExitDirection = 'left' | 'right' | 'up' | 'none'

/** A swipe commits past this horizontal offset (px) or velocity (px/s). */
const SWIPE_OFFSET = 120
const SWIPE_VELOCITY = 500

const cardVariants = {
  enter: { y: 10, scale: 0.985 },
  center: { y: 0, scale: 1, transition: { duration: 0.18 } },
  exit: (direction: ExitDirection) => {
    switch (direction) {
      case 'right':
        return { x: 720, rotate: 14, opacity: 0, transition: { duration: 0.28 } }
      case 'left':
        return { x: -720, rotate: -14, opacity: 0, transition: { duration: 0.28 } }
      case 'up':
        return { y: -48, opacity: 0, transition: { duration: 0.2 } }
      default:
        return { opacity: 0, transition: { duration: 0.12 } }
    }
  },
}

interface Tracked {
  path: string
  verdict: Verdict
  openComments: number
  exitDirection: ExitDirection
}

export function CardDeck({ files, currentPath, sessionId, onNavigate, commentFocusToken = 0, scope }: CardDeckProps) {
  const { fileReview, commentsFor, setVerdict: sendVerdict } = useReview()
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

  // The fly-off direction is derived from what happened to the card that just left: approved
  // flies right, rejected flies left, a comment-only advance lifts off, anything else fades.
  const [tracked, setTracked] = useState<Tracked>(() => ({ path: currentPath, ...signatureOf(currentPath), exitDirection: 'none' }))
  const signature = signatureOf(currentPath)
  if (tracked.path !== currentPath) {
    const previous = signatureOf(tracked.path)
    let exitDirection: ExitDirection = 'none'
    if (previous.verdict === 'approved' && tracked.verdict !== 'approved') exitDirection = 'right'
    else if (previous.verdict === 'rejected' && tracked.verdict !== 'rejected') exitDirection = 'left'
    else if (previous.openComments > tracked.openComments) exitDirection = 'up'
    setTracked({ path: currentPath, ...signature, exitDirection })
  } else if (tracked.verdict !== signature.verdict || tracked.openComments !== signature.openComments) {
    setTracked({ ...tracked, ...signature })
  }

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
    <div className="flex min-h-0 flex-1 items-start justify-center gap-3 px-4 pt-11 pb-6 md:gap-6 md:px-8">
      <Button
        variant="outline"
        size="icon-lg"
        aria-label="Previous file"
        disabled={index === 0}
        onClick={() => step(-1)}
        className="mt-64 hidden shrink-0 rounded-full bg-card md:inline-flex"
      >
        <ChevronLeft aria-hidden />
      </Button>

      <div className="flex w-full max-w-[1200px] min-w-0 flex-1 flex-col gap-3 self-stretch">
        <div className="relative min-h-[560px] flex-1">
          {[2, 1].map((offset) => {
            const peek = files[index + offset]
            if (!peek) return null
            return (
              <div
                key={peek.path}
                aria-hidden
                className="absolute h-14 rounded-2xl border bg-card"
                style={{ left: 14 * offset, right: 14 * offset, top: -14 * offset, opacity: offset === 1 ? 0.85 : 0.55 }}
              />
            )
          })}
          <AnimatePresence initial={false} custom={tracked.exitDirection}>
            {current && (
              <SwipeCard
                key={current.path}
                file={current}
                sessionId={sessionId}
                position={{ index, total: files.length }}
                exitDirection={tracked.exitDirection}
                commentFocusToken={commentFocusToken}
                scope={scope}
                onCommit={commit}
              />
            )}
          </AnimatePresence>
        </div>
        <p className="text-center text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {index + 1} / {files.length}
        </p>
      </div>

      <Button
        variant="outline"
        size="icon-lg"
        aria-label="Next file"
        disabled={index >= files.length - 1}
        onClick={() => step(1)}
        className="mt-64 hidden shrink-0 rounded-full bg-card md:inline-flex"
      >
        <ChevronRight aria-hidden />
      </Button>
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

/** Owns its own motion values so an exiting card never shares them with the next one. */
function SwipeCard({ file, sessionId, position, exitDirection, commentFocusToken, scope, onCommit }: SwipeCardProps) {
  const controls = useDragControls()
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-320, 0, 320], [-9, 0, 9])
  const opacity = useTransform(x, [-360, -140, 0, 140, 360], [0.35, 1, 1, 1, 0.35])

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    // Buttons in the header (the layout toggle) keep working as buttons.
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return
    controls.start(event)
  }

  function handleDragEnd(_event: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_OFFSET || info.velocity.x > SWIPE_VELOCITY) onCommit('right')
    else if (info.offset.x < -SWIPE_OFFSET || info.velocity.x < -SWIPE_VELOCITY) onCommit('left')
  }

  return (
    <motion.div
      className="absolute inset-0"
      style={{ x, rotate, opacity }}
      drag="x"
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      custom={exitDirection}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
    >
      <FileReviewCard
        file={file}
        sessionId={sessionId}
        position={position}
        commentFocusToken={commentFocusToken}
        scope={scope}
        onHeaderPointerDown={startDrag}
        className="h-full"
      />
    </motion.div>
  )
}
