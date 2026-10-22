import useEmblaCarousel from "embla-carousel-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RunCarouselProps {
  /** The region's name for assistive tech. */
  label: string;
  /** Zero-based index of the current slide. */
  index: number;
  slides: readonly { key: string; node: ReactNode }[];
  className?: string;
}

/**
 * One slide per card (embla, drag disabled so the viewers keep the pointer), like the Evidence page's carousel. Only the
 * current slide has content; the others stay empty and collapse, so the carousel is as tall as its card. Movement is the caller's.
 */
export function RunCarousel({ label, index, slides, className }: RunCarouselProps) {
  const [viewportRef, api] = useEmblaCarousel({ watchDrag: false, duration: 20, startIndex: index });

  useEffect(() => {
    if (api && api.selectedScrollSnap() !== index) api.scrollTo(index);
  }, [api, index]);

  return (
    <div className={cn("relative min-w-0", className)} role="region" aria-roledescription="carousel" aria-label={label}>
      <div ref={viewportRef} className="overflow-hidden">
        <div className="flex items-start">
          {slides.map((slide, i) => (
            <div
              key={slide.key}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
              inert={i !== index}
              className={cn("min-w-0 shrink-0 grow-0 basis-full", i !== index && "h-0 overflow-hidden")}
            >
              {i === index ? slide.node : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
