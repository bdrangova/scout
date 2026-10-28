import type { EvidenceItem } from '@scout/shared'
import useEmblaCarousel from 'embla-carousel-react'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { EvidenceCard } from './EvidenceCard'

export interface EvidenceCarouselProps {
  items: readonly EvidenceItem[]
  sessionId: string
  /** Zero-based index of the current item (the URL's). */
  index: number
  commentFocusToken?: number
}

/**
 * One slide per evidence item (embla, drag disabled so the viewers keep the pointer). It fills the
 * height its parent gives it from 900px up, so the viewer fits the viewport; narrower, it is as
 * tall as the card. Movement is the page's (`useEvidenceNav`).
 */
export function EvidenceCarousel({ items, sessionId, index, commentFocusToken = 0 }: EvidenceCarouselProps) {
  const [viewportRef, api] = useEmblaCarousel({ watchDrag: false, duration: 20, startIndex: index })

  useEffect(() => {
    if (api && api.selectedScrollSnap() !== index) api.scrollTo(index)
  }, [api, index])

  return (
    <div className="relative min-h-0 flex-1 max-[899px]:flex-none" role="region" aria-roledescription="carousel" aria-label="Evidence">
      <div ref={viewportRef} className="h-full overflow-hidden">
        <div className="flex h-full items-stretch">
          {items.map((item, i) => (
            <div
              key={item.path}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${items.length}`}
              inert={i !== index}
              className={cn('h-full min-w-0 shrink-0 grow-0 basis-full transition-opacity', i !== index && 'opacity-40')}
            >
              <EvidenceCard item={item} sessionId={sessionId} active={i === index} commentFocusToken={commentFocusToken} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
