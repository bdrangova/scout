import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { effectiveVerdict, type TreeFile } from '@scout/shared'
import { XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FileReviewCard } from '@/components/diff/FileReviewCard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { useReview } from '@/state/review-context'

export interface FilePreviewProps {
  /** The file to show; null keeps the preview closed. */
  file: TreeFile | null
  sessionId: string
  /** The `data-box-key` of the box that opened it: it gets the focus back on close. */
  boxKey: string | null
  onClose: () => void
}

/** The box to focus again once the preview closed. */
function boxElement(key: string | null): HTMLElement | null {
  if (key === null) return null
  return Array.from(document.querySelectorAll<HTMLElement>('[data-box-key]')).find((element) => element.dataset.boxKey === key) ?? null
}

function PreviewCard({ file, sessionId, boxKey, onClose }: { file: TreeFile; sessionId: string; boxKey: string | null; onClose: () => void }) {
  const { fileReview } = useReview()
  const verdict = effectiveVerdict(fileReview(file.path), file)
  const [opened] = useState(verdict)
  // An approve, a reject with its comment, or a cleared verdict ends the preview: the box behind shows its new colour.
  useEffect(() => {
    if (verdict !== opened) onClose()
  }, [verdict, opened, onClose])
  return (
    <DialogPortal>
      <DialogOverlay className="bg-ink/80" />
      <DialogPrimitive.Popup
        data-slot="blueprint-preview"
        finalFocus={() => boxElement(boxKey) ?? true}
        className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 outline-none"
      >
        <DialogTitle className="sr-only">{file.path}</DialogTitle>
        <FileReviewCard file={file} sessionId={sessionId} className="max-h-[86dvh]" />
        <DialogClose render={<Button variant="default" size="icon-sm" className="absolute -top-3 -right-3 z-10 rounded-full shadow-none max-sm:top-1 max-sm:right-1" aria-label="Close preview" title="Close (Esc)" />}>
          <XIcon aria-hidden />
        </DialogClose>
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

/**
 * Ctrl or Cmd + click on a file box: the same review card the Files page shows in Swipe mode, centred over a flat dark scrim.
 * It is the real card (diff, Scout's notes, comments, Approve / Reject), so every verdict goes through the same review state.
 */
export function FilePreview({ file, sessionId, boxKey, onClose }: FilePreviewProps) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      {file && <PreviewCard key={file.path} file={file} sessionId={sessionId} boxKey={boxKey} onClose={onClose} />}
    </Dialog>
  )
}
