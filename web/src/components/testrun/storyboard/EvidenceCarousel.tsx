import { FileJson, Film } from "lucide-react";
import type { ReactNode } from "react";
import { EvidenceNav } from "@/components/evidence/EvidenceNav";
import { runFileUrl } from "@/lib/paths";
import { useHotkeys } from "@/lib/useHotkeys";
import { cn } from "@/lib/utils";
import { RunCarousel } from "../RunCarousel";
import { entryName, type EvidenceEntry } from "../scenario-evidence";

export interface EvidenceCarouselProps {
  sessionId: string;
  entries: readonly EvidenceEntry[];
  /** Zero-based index of the current item. */
  index: number;
  onIndexChange: (index: number) => void;
  /** The card of the current item. */
  renderCard: (entry: EvidenceEntry) => ReactNode;
}

/**
 * A scenario's evidence, one item at a time: the `n / N` nav, a thumbnail strip to see where you are, and the card.
 * `Shift+←` / `Shift+→` move through it (the plain arrows move between scenarios).
 */
export function EvidenceCarousel({ sessionId, entries, index, onIndexChange, renderCard }: EvidenceCarouselProps) {
  const current = Math.min(Math.max(index, 0), Math.max(entries.length - 1, 0));
  const go = (delta: number) => {
    const next = current + delta;
    if (next >= 0 && next < entries.length) onIndexChange(next);
  };
  useHotkeys({ prevEvidence: () => go(-1), nextEvidence: () => go(1) });

  const entry = entries[current];
  if (entry === undefined) return null;
  return (
    <section aria-label="Evidence" data-slot="evidence-carousel" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ul aria-label="Evidence thumbnails" className="m-0 flex min-w-0 flex-1 list-none gap-1.5 overflow-x-auto p-0.5">
          {entries.map((candidate, position) => {
            const name = entryName(candidate);
            return (
              <li key={candidate.ref.path} className="shrink-0">
                <button
                  type="button"
                  aria-label={`Show ${name}`}
                  title={`${name} (Shift+←/→)`}
                  aria-current={position === current ? "true" : undefined}
                  onClick={() => onIndexChange(position)}
                  className={cn(
                    "flex h-11 w-16 items-center justify-center overflow-hidden rounded-md border-fine border-line bg-sunken text-ink-muted transition-colors hover:bg-hover",
                    position === current && "border-ink ring-2 ring-ink",
                  )}
                >
                  {candidate.kind === "image" ? (
                    <img src={runFileUrl(sessionId, candidate.ref.path)} alt="" loading="lazy" className="size-full object-cover" />
                  ) : candidate.kind === "video" ? (
                    <Film aria-hidden className="size-5" />
                  ) : (
                    <FileJson aria-hidden className="size-5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <EvidenceNav index={current} total={entries.length} onGo={go} />
      </div>
      <RunCarousel
        label="Evidence cards"
        index={current}
        slides={entries.map((candidate, position) => ({
          key: candidate.ref.path,
          node: position === current ? renderCard(candidate) : null,
        }))}
      />
    </section>
  );
}
