import { useRef, useState, type KeyboardEvent } from 'react'
import type { PrFinding } from '@review-dash/shared'
import { ChevronDown } from 'lucide-react'
import { EvidenceNav } from '@/components/evidence/EvidenceNav'
import { ImageViewer } from '@/components/evidence/ImageViewer'
import { VideoPlayer } from '@/components/evidence/VideoPlayer'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Notice } from '@/components/ui/notice'
import { Tag } from '@/components/ui/tag'

import { EvidenceLog } from './EvidenceLog'
import { type EvidenceItem } from './reproduction-evidence'

/** A reproduction video: the shared player without comment markers; it stops when you move to another item. */
function FocusVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  return <VideoPlayer src={src} videoRef={videoRef} comments={[]} activeCommentId={null} active onTimeUpdate={() => {}} />
}

export interface ReproductionFocusProps {
  finding: PrFinding
  /** Ordered evidence (see `orderedEvidence`) and the media URL of each item. */
  items: readonly EvidenceItem[]
  srcOf: (item: EvidenceItem) => string
  /** The open item, or null when closed. */
  index: number | null
  onIndexChange: (index: number | null) => void
}

/**
 * A finding's reproduction, one evidence item at a time over the whole viewport. The header carries only what
 * the item needs to be read: the finding, its status, the step it belongs to and the caption; Expected/Actual
 * and setup sit behind Details. ←/→ move through the items.
 */
export function ReproductionFocus({ finding, items, srcOf, index, onIndexChange }: ReproductionFocusProps) {
  const [details, setDetails] = useState(false)
  const r = finding.reproduction
  const current = index === null ? null : Math.min(Math.max(index, 0), items.length - 1)
  const item = current === null ? undefined : items[current]
  const go = (delta: number) => {
    if (current === null) return
    const next = current + delta
    if (next >= 0 && next < items.length) onIndexChange(next)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    // Inside the video player the arrows seek.
    if (event.target instanceof Element && event.target.closest('media-controller')) return
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (delta === 0) return
    // Consumed here, so the page's own ←/→ (move between files) stays put behind the dialog.
    event.preventDefault()
    go(delta)
  }
  const stepIndex = item ? r.steps.findIndex((s) => s.id === item.stepId) : -1
  const step = stepIndex >= 0 ? r.steps[stepIndex] : undefined

  return <Dialog open={item !== undefined} onOpenChange={(open) => !open && onIndexChange(null)}>
    <DialogContent onKeyDown={onKeyDown} className="h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none gap-0 p-0 sm:max-w-none grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
      {item && <>
        <header className="flex flex-col gap-1.5 border-b-fine border-line px-4 pt-3 pb-2.5 pr-12">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <Tag tone={r.status === 'reproduced' ? 'ok' : 'warn'}>{r.status}</Tag>
            <DialogTitle className="min-w-0 flex-1 truncate text-sm font-bold" title={finding.title}>{finding.title}</DialogTitle>
            <EvidenceNav index={current!} total={items.length} onGo={go} />
          </div>
          <DialogDescription className="m-0 text-sm text-ink">
            <span className="font-mono text-xs font-semibold text-ink-muted">Step {stepIndex >= 0 ? `${stepIndex + 1}/${r.steps.length}` : item.stepId}</span>{' '}
            {step?.instruction ?? item.caption}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {step && <p className="m-0 min-w-0 flex-1 text-xs text-ink-muted">{item.caption}</p>}
            <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
              Details <ChevronDown aria-hidden className={details ? 'rotate-180' : undefined} />
            </Button>
          </div>
          {details && <div className="flex max-h-[35dvh] flex-col gap-1.5 overflow-auto border-t-fine border-line pt-2 text-xs">
            <p className="m-0"><strong>Expected:</strong> {r.expected}</p>
            <p className="m-0"><strong>Actual:</strong> {r.actual}</p>
            {r.limitation && <Notice tone="warn">{r.limitation}</Notice>}
            <p className="m-0 text-ink-muted">{r.environment} · revision <code>{r.revision.slice(0, 12)}</code></p>
          </div>}
        </header>
        <div className="flex min-h-0 flex-col p-3">
          {item.kind === 'screenshot' ? <ImageViewer key={srcOf(item)} src={srcOf(item)} alt={item.caption} /> : item.kind === 'video' ? <FocusVideo key={srcOf(item)} src={srcOf(item)} /> : <EvidenceLog src={srcOf(item)} />}
        </div>
      </>}
    </DialogContent>
  </Dialog>
}
