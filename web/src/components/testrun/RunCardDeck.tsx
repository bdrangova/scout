import type { ReactNode } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router";
import { EvidenceNav } from "@/components/evidence/EvidenceNav";
import { modeSearch } from "@/lib/mode";
import { useHotkeys, type HotkeyHandlers } from "@/lib/useHotkeys";
import { RunCarousel } from "./RunCarousel";
import { useRunGrid } from "./useRunMode";

export interface RunCardDeckProps<T> {
  /** What the cards are: `Evidence`, `Logs`; names the section (the carousel inside is `<label> cards`). */
  label: string;
  items: readonly T[];
  itemKey: (item: T) => string;
  /** Zero-based index of the current card. */
  index: number;
  onIndexChange: (index: number) => void;
  /** The card of the current item. */
  renderCard: (item: T) => ReactNode;
  /** The grid's tile of an item; `open` shows the item as a card in swipe mode. */
  renderTile: (item: T, current: boolean, open: () => void) => ReactNode;
  /** Bind `J` / `K` to the previous / next card too (the Review page keeps them for scenarios). */
  stepKeys?: boolean;
  className?: string;
}

/**
 * The cards of a test-run page in the two modes of the code review: Swipe (one card in an embla carousel, with the
 * `n / N` nav and the arrow keys) and Grid (a tile per item; a tile opens its card). The mode is the URL's `?mode=`, set from the rail.
 */
export function RunCardDeck<T>({
  label,
  items,
  itemKey,
  index,
  onIndexChange,
  renderCard,
  renderTile,
  stepKeys = false,
  className,
}: RunCardDeckProps<T>) {
  const grid = useRunGrid();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const current = Math.min(Math.max(index, 0), Math.max(items.length - 1, 0));

  const go = (delta: number) => {
    const next = current + delta;
    if (next >= 0 && next < items.length) onIndexChange(next);
  };
  const handlers: HotkeyHandlers = grid
    ? {}
    : { prev: () => go(-1), next: () => go(1), ...(stepKeys && { prevScenario: () => go(-1), nextScenario: () => go(1) }) };
  useHotkeys(handlers);

  function open(next: number) {
    onIndexChange(next);
    navigate({ pathname: location.pathname, search: modeSearch(searchParams, "swipe") }, { replace: true });
  }

  const item = items[current];
  if (item === undefined) return null;
  return (
    <section aria-label={label} data-slot="run-card-deck" data-mode={grid ? "grid" : "swipe"} className={className}>
      {grid ? (
        <ul
          aria-label={`${label} grid`}
          className="m-0 grid list-none gap-3.5 p-0"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}
        >
          {items.map((candidate, position) => (
            <li key={itemKey(candidate)} className="contents">
              {renderTile(candidate, position === current, () => open(position))}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          {items.length > 1 && (
            <div className="flex items-center justify-end">
              <EvidenceNav index={current} total={items.length} onGo={go} />
            </div>
          )}
          <RunCarousel
            label={`${label} cards`}
            index={current}
            slides={items.map((candidate, position) => ({
              key: itemKey(candidate),
              node: position === current ? renderCard(candidate) : null,
            }))}
          />
        </div>
      )}
    </section>
  );
}
