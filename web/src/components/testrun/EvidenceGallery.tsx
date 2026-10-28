import type { EvidenceRef } from "@scout/shared";
import { useState } from "react";
import { ImageViewer } from "@/components/evidence/ImageViewer";
import { runFileUrl } from "@/lib/paths";
import { cn } from "@/lib/utils";

export interface EvidenceGalleryProps {
  sessionId: string;
  items: readonly EvidenceRef[];
  className?: string;
}

function captionOf(item: EvidenceRef): string {
  return item.caption ?? item.path.slice(item.path.lastIndexOf("/") + 1);
}

/** A strip of thumbnails; the selected one opens in the zoomable `ImageViewer` below with its caption and layer. */
export function EvidenceGallery({
  sessionId,
  items,
  className,
}: EvidenceGalleryProps) {
  const [selected, setSelected] = useState(0);
  const current = items[Math.min(selected, items.length - 1)];
  if (!current) return null;
  return (
    <div
      data-slot="evidence-gallery"
      className={cn("flex flex-col gap-2", className)}
    >
      <ul
        aria-label="Screenshots"
        className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1"
      >
        {items.map((item, index) => (
          <li key={`${item.path}:${index}`} className="shrink-0">
            <button
              type="button"
              aria-label={`Show ${captionOf(item)}`}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
              className={cn(
                "block overflow-hidden rounded-lg border-fine border-line bg-sunken",
                index === selected && "border-ink ring-2 ring-focus",
              )}
            >
              <img
                src={runFileUrl(sessionId, item.path)}
                alt=""
                loading="lazy"
                className="block h-16 w-24 object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs font-semibold text-ink-muted">
        <span className="text-ink">{captionOf(current)}</span>
        {current.layer !== undefined && <> · {current.layer}</>}
      </p>
      <div className="flex h-[clamp(240px,45svh,440px)] flex-col">
        <ImageViewer
          src={runFileUrl(sessionId, current.path)}
          alt={captionOf(current)}
        />
      </div>
    </div>
  );
}
