import { nextUnreviewedFile, type TreeFile } from '@scout/shared'
import { XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { CardDeck } from '@/components/diff/CardDeck'
import { useDeckKeys } from '@/components/diff/useDeckKeys'
import { useFileUrlSync } from '@/components/diff/useFileUrlSync'
import { undoLastVerdict } from '@/components/diff/useVerdictAction'
import { Button } from '@/components/ui/button'
import { toggleJournalInline } from '@/lib/journal-prefs'
import { indexByPath } from '@/lib/scope'
import { useHotkeys } from '@/lib/useHotkeys'
import { useReview } from '@/state/review-context'

export interface BlueprintDeckProps {
  sessionId: string
  /** The cards, in order; the full diff's own files, so verdicts are the Files page's. */
  files: readonly TreeFile[]
  /** The diagram's title, or "N selected files". */
  title: string
  /** The open card (a path of `files`). */
  currentPath: string
  /** Move to another card (the page keeps the URL). */
  onNavigate: (path: string) => void
  /** Draw the next cards as a stack behind the open one: for a deck of picked files, not for a card opened from its box. */
  stacked: boolean
  onClose: () => void
}

/**
 * The Files page's Swipe deck over the Blueprint diagram: same cards, same review state, same keys (A, X, C, arrows, N, Z), straight on a flat dark
 * scrim with no dialog frame. Esc, a click on the scrim and the corner button close.
 */
export function BlueprintDeck({ sessionId, files, title, currentPath, onNavigate, stacked, onClose }: BlueprintDeckProps) {
  const { state, dispatch } = useReview()
  const fullByPath = useMemo(() => indexByPath(files), [files])
  const current = fullByPath.get(currentPath) ?? null

  // The review follows the open card. When a verdict makes the reducer jump somewhere (over the whole diff), the deck moves to its own next undecided card instead.
  const stateFile = state.review.ui.currentFile
  const statePath = useMemo(() => {
    if (stateFile === null || stateFile === currentPath) return stateFile
    return nextUnreviewedFile({ ...state.review, ui: { ...state.review.ui, currentFile: currentPath } }, files)
  }, [stateFile, currentPath, state.review, files])
  useFileUrlSync(currentPath, statePath, onNavigate)
  useEffect(() => {
    dispatch({ type: 'MARK_VIEWED', path: currentPath })
  }, [currentPath, dispatch])

  const { commentFocusToken, hotkeys } = useDeckKeys({ files, current, fullByPath, onGoTo: onNavigate })

  function close() {
    dispatch({ type: 'CANCEL_REJECT' })
    onClose()
  }

  useHotkeys({
    ...hotkeys,
    undo: undoLastVerdict,
    toggleNotes: () => toast.info(toggleJournalInline() ? "Scout's notes shown" : "Scout's notes hidden"),
    // Esc first gives up a reject that still waits for its comment, like on the Files page.
    cancel: () => (state.pendingReject !== null ? dispatch({ type: 'CANCEL_REJECT' }) : close()),
  })

  // No dialog frame: the cards sit straight on the scrim. The page behind is inert while they are up, and gets its focus back after.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const page = document.getElementById('root')
    page?.setAttribute('inert', '')
    rootRef.current?.focus()
    return () => {
      page?.removeAttribute('inert')
      before?.focus()
    }
  }, [])

  /** A click that lands on no card and no control is a click on the scrim. */
  function onBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('article, button, a, input, textarea, select, [data-slot="deck-peek"]') === null) close()
  }

  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-slot="blueprint-deck" className="fixed inset-0 z-50 flex flex-col outline-none">
      <div aria-hidden data-slot="blueprint-deck-scrim" className="absolute inset-0 bg-black/75" onClick={close} />
      <Button variant="default" size="icon-sm" aria-label="Close cards" title="Close (Esc)" className="absolute top-3 right-3 z-10 shadow-none" onClick={close}>
        <XIcon aria-hidden />
      </Button>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto [&_p[aria-live]]:text-white/85" onClick={onBackdropClick}>
        <CardDeck files={files} currentPath={currentPath} sessionId={sessionId} onNavigate={onNavigate} commentFocusToken={commentFocusToken} stacked={stacked} />
      </div>
    </div>,
    document.body,
  )
}
