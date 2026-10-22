import { MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RunTileProps {
  /** The tile's name (the button's accessible name). */
  title: string;
  /** Tags or a line of detail under the title. */
  detail?: ReactNode;
  /** A preview: a thumbnail or an icon. */
  preview?: ReactNode;
  current: boolean;
  /** Open comments; shown as a count. */
  comments?: number;
  onOpen: () => void;
}

/** A compact tile of the grid, the counterpart of the Files page's `FileTile`: preview, title, detail line and the open-comment count. */
export function RunTile({ title, detail, preview, current, comments = 0, onOpen }: RunTileProps) {
  return (
    <div
      data-slot="run-tile"
      data-current={current || undefined}
      className={cn(
        "relative min-w-0 rounded-xl border-fine border-line bg-surface text-ink transition-colors hover:bg-paper-2",
        "has-[>button:focus-visible]:outline-[3px] has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-focus",
        current && "border-ink ring-2 ring-ink",
      )}
    >
      <button
        type="button"
        aria-label={title}
        aria-current={current || undefined}
        title={title}
        onClick={onOpen}
        className="flex h-full w-full flex-col gap-2.5 rounded-[inherit] p-3 text-left focus-visible:outline-none"
      >
        {preview !== undefined && (
          <span className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border-fine border-line bg-sunken text-ink-muted">
            {preview}
          </span>
        )}
        <span className="truncate text-sm leading-[19px] font-bold">{title}</span>
        <span className="flex w-full flex-wrap items-center gap-1.5 text-xs">
          {detail}
          {comments > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 font-bold tabular-nums">
              <MessageSquare aria-hidden className="size-3.5 stroke-[2.25]" />
              {comments}
              <span className="sr-only">open comments</span>
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
