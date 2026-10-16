import type { EvidenceItem } from '@review-dash/shared'
import useEmblaCarousel from 'embla-carousel-react'
import { ChevronLeft, ChevronRight, Film } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { pluralize } from '@/lib/format'
import { evidenceUrl, splitPath } from '@/lib/paths'
import { useHotkeys } from '@/lib/useHotkeys'
import { cn } from '@/lib/utils'
import { useReview } from '@/state/review-context'
import { EvidenceCard } from './EvidenceCard'

export interface EvidenceCarouselProps {
  items: readonly EvidenceItem[]
  sessionId: string
  /** The current item's path in `evidence/` (also its comment ref). */
  currentPath: string
  onChange: (path: string) => void
  commentFocusToken?: number
}

/**
 * One slide per evidence item (embla, drag disabled so the viewers keep the pointer), `←/→`
 * when focus is not in an input, and a thumbnail strip underneath. The current item is the URL's.
 */
export function EvidenceCarousel({ items, sessionId, currentPath, onChange, commentFocusToken = 0 }: EvidenceCarouselProps) {
  const index = Math.max(0, items.findIndex((item) => item.path === currentPath))
  const [viewportRef, api] = useEmblaCarousel({ watchDrag: false, duration: 20, startIndex: index })
  const { comments } = useReview()

  useEffect(() => {
    if (api && api.selectedScrollSnap() !== index) api.scrollTo(index)
  }, [api, index])

  function go(delta: number) {
    const next = items[index + delta]
    if (next) onChange(next.path)
  }

  useHotkeys({ prev: () => go(-1), next: () => go(1) })

  return (
    <div className="flex flex-col gap-4">
      <div className="relative" role="region" aria-roledescription="carousel" aria-label="Evidence">
        <div ref={viewportRef} className="overflow-hidden">
          <div className="flex items-start">
            {items.map((item, i) => (
              <div
                key={item.path}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${items.length}`}
                inert={i !== index}
                className={cn('min-w-0 shrink-0 grow-0 basis-full pr-px transition-opacity', i !== index && 'opacity-40')}
              >
                <EvidenceCard item={item} sessionId={sessionId} active={i === index} commentFocusToken={commentFocusToken} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon-sm" aria-label="Previous item" disabled={index === 0} onClick={() => go(-1)}>
          <ChevronLeft />
        </Button>
        <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1" aria-label="Evidence items">
          {items.map((item, i) => {
            const count = comments.filter((c) => c.target.kind === 'evidence' && c.target.ref === item.path && c.status === 'open').length
            const { name } = splitPath(item.path)
            const detail = [item.type, count > 0 ? pluralize(count, 'comment') : null]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={item.path} className="shrink-0">
                <button
                  type="button"
                  aria-current={i === index ? 'true' : undefined}
                  aria-label={`${name} (${detail})`}
                  onClick={() => onChange(item.path)}
                  className={cn(
                    'flex w-44 items-center gap-2.5 rounded-lg border bg-card p-1.5 text-left text-xs transition-colors hover:border-foreground/40',
                    i === index && 'border-foreground ring-1 ring-foreground/20',
                  )}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {item.type === 'image' ? (
                      <img src={evidenceUrl(sessionId, item.path)} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <Film className="size-5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-[12px]">{name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{detail}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <Button variant="outline" size="icon-sm" aria-label="Next item" disabled={index >= items.length - 1} onClick={() => go(1)}>
          <ChevronRight />
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          {index + 1} / {items.length}
        </span>
      </div>
    </div>
  )
}
