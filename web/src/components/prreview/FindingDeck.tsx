import { currentProposal, type PrFinding } from '@scout/shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { PEEK_COUNT, PEEK_INSET, PEEK_RISE, useExitDirection } from '@/components/diff/deck-motion'
import { NavButton, SwipeFrame } from '@/components/diff/DeckParts'
import { useReview } from '@/state/review-context'
import { FindingCard } from './FindingCard'
import { useCurrentPrReport } from './pr-review-context'
import { useProposal } from './useProposal'

export interface FindingDeckProps {
  findings: readonly PrFinding[]
  currentId: string
  /** Comments said about each finding (see `useFindingCommentCounts`). */
  commentCounts: ReadonlyMap<string, number>
  onNavigate: (id: string) => void
}

/**
 * Swipe mode of the PR review's Evidence page, the scenario deck's counterpart: one finding card with the next ones as
 * layers behind it, dragged from its header (right approves the suggested comment, left rejects it, and the next
 * finding comes up), the round previous / next buttons and the `n / N` counter.
 */
export function FindingDeck({ findings, currentId, commentCounts, onNavigate }: FindingDeckProps) {
  const { report, current: reportCurrent } = useCurrentPrReport()
  const { state } = useReview()
  const found = findings.findIndex((finding) => finding.id === currentId)
  const index = found === -1 ? 0 : found
  const current = findings[index]
  const proposal = useProposal(current ?? findings[0]!)

  const exitDirection = useExitDirection(currentId, (id) => {
    const finding = findings.find((candidate) => candidate.id === id)
    return {
      verdict: finding && report && reportCurrent ? currentProposal(report, finding, state.review).verdict : 'none',
      openComments: commentCounts.get(id) ?? 0,
    }
  })

  function step(delta: number) {
    const next = findings[index + delta]
    if (next) onNavigate(next.id)
  }

  function commit(direction: 'left' | 'right') {
    if (proposal?.decide(direction === 'right' ? 'approved' : 'rejected')) step(1)
  }

  return (
    <div className="flex min-h-0 flex-1 items-stretch justify-center gap-3 pt-7 md:gap-5">
      <NavButton label="Previous finding" disabled={index === 0} onClick={() => step(-1)}>
        <ChevronLeft aria-hidden />
      </NavButton>
      <div className="flex w-full max-w-[1100px] min-w-0 flex-1 flex-col gap-3">
        <div className="relative flex min-h-[480px] flex-1">
          {Array.from({ length: PEEK_COUNT }, (_, i) => PEEK_COUNT - i).map((offset) => {
            const peek = findings[index + offset]
            if (!peek) return null
            return (
              <div
                key={peek.id}
                aria-hidden
                data-slot="deck-peek"
                className="absolute h-11 rounded-2xl border-fine border-line bg-paper-2"
                style={{ left: PEEK_INSET * offset, right: PEEK_INSET * offset, top: -PEEK_RISE * offset }}
              />
            )
          })}
          <AnimatePresence initial={false} custom={exitDirection}>
            {current && (
              <SwipeFrame key={current.id} exitDirection={exitDirection} onCommit={commit}>
                {(startDrag) => <FindingCard finding={current} position={{ index, total: findings.length }} onHeaderPointerDown={startDrag} className="h-full" />}
              </SwipeFrame>
            )}
          </AnimatePresence>
        </div>
      </div>
      <NavButton label="Next finding" disabled={index >= findings.length - 1} onClick={() => step(1)}>
        <ChevronRight aria-hidden />
      </NavButton>
    </div>
  )
}
