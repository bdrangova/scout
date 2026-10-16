import type { TreeFile } from '@review-dash/shared'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import type { ScopeReview } from '@/lib/scope'
import { FileReviewCard } from './FileReviewCard'

export interface ScrollListProps {
  files: readonly TreeFile[]
  currentPath: string
  sessionId: string
  onNavigate: (path: string) => void
  /** Bump to focus the current card's comment box. */
  commentFocusToken?: number
  /** Set when `files` are one scope's files: verdicts are read from and pinned to the full diff. */
  scope?: ScopeReview
}

/** A card's height before it is measured (header + diff viewport + comments + footer). */
const ESTIMATED_CARD_HEIGHT = 640
const CARD_GAP = 16
/** Upper bound on the frames spent settling the scroll position (patches load within this). */
const SCROLL_SETTLE_FRAMES = 240
/** The aligned card must hold its position this many frames in a row before settling stops. */
const SCROLL_STABLE_FRAMES = 20
/** A card whose top is closer than this to the scroller's bottom edge counts as out of view. */
const SCROLL_VISIBLE_MIN = 120
/** Where an aligned card's top lands: the list's own top padding (`py-6`). */
const SCROLL_TOP_PADDING = 24

/**
 * Every card stacked in one virtualized scroller: only the cards near the viewport are mounted,
 * each measured after render, and the current file is scrolled into view when it changes.
 */
export function ScrollList({ files, currentPath, sessionId, onNavigate, commentFocusToken = 0, scope }: ScrollListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const currentIndex = Math.max(
    0,
    files.findIndex((file) => file.path === currentPath),
  )

  // The compiler skips memoizing this component; its returned functions are used here only.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 2,
    gap: CARD_GAP,
    getItemKey: (index) => files[index]?.path ?? index,
  })

  // Bring the current file into view. Cards are measured only once mounted and grow again when
  // their patch arrives, so the virtualizer's own `scrollToIndex` lands on estimates and drifts.
  // After the first call the position is settled from DOM geometry, frame by frame, until it has
  // held still for a while: a card already in view is left alone (a click on it must not jump),
  // otherwise its top is aligned with the list's padding. The user scrolling stops the settling.
  useEffect(() => {
    const scroller = scrollerRef.current
    let frame = 0
    let tries = 0
    let stableFrames = 0
    let aligning = false
    virtualizer.scrollToIndex(currentIndex, { align: 'auto' })
    const stop = () => window.cancelAnimationFrame(frame)
    const settle = () => {
      tries += 1
      const element = scroller?.querySelector<HTMLElement>(`[data-index="${currentIndex}"]`) ?? null
      if (scroller && element) {
        const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        const inView = top >= 0 && top <= scroller.clientHeight - SCROLL_VISIBLE_MIN
        if (!aligning && inView) return
        aligning = true
        if (Math.abs(top - SCROLL_TOP_PADDING) <= 1) {
          stableFrames += 1
          if (stableFrames >= SCROLL_STABLE_FRAMES) return
        } else {
          stableFrames = 0
          scroller.scrollTop += top - SCROLL_TOP_PADDING
        }
      } else {
        aligning = true
        virtualizer.scrollToIndex(currentIndex, { align: 'start' })
      }
      if (tries < SCROLL_SETTLE_FRAMES) frame = window.requestAnimationFrame(settle)
    }
    frame = window.requestAnimationFrame(settle)
    scroller?.addEventListener('wheel', stop, { passive: true })
    scroller?.addEventListener('pointerdown', stop)
    return () => {
      stop()
      scroller?.removeEventListener('wheel', stop)
      scroller?.removeEventListener('pointerdown', stop)
    }
  }, [virtualizer, currentIndex])

  return (
    <div
      ref={scrollerRef}
      data-testid="scroll-list"
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ overflowAnchor: 'none' }}
    >
      <div className="relative mx-auto w-full max-w-[1200px] px-4 py-6 md:px-8" style={{ height: virtualizer.getTotalSize() + 48 }}>
        {virtualizer.getVirtualItems().map((item) => {
          const file = files[item.index]
          if (!file) return null
          const active = file.path === currentPath
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              className="absolute inset-x-4 top-6 md:inset-x-8"
              style={{ transform: `translateY(${item.start}px)` }}
              onClickCapture={() => {
                if (!active) onNavigate(file.path)
              }}
            >
              <FileReviewCard
                file={file}
                sessionId={sessionId}
                active={active}
                commentFocusToken={active ? commentFocusToken : 0}
                scope={scope}
                bodyClassName="max-h-[70vh]"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
