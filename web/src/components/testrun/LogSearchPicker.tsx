import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LogSearch } from "./useLogSearch";

export interface LogSearchPickerProps {
  search: LogSearch;
  /** The grid shows no lines to search. */
  disabled: boolean;
}

/** The Logs page's pickers in the rail: Find (Enter = next match), Failures, previous / next and the match counter. */
export function LogSearchPicker({ search, disabled }: LogSearchPickerProps) {
  const total = search.matches.length;
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          search.step(1);
        }}
      >
        <input
          type="search"
          aria-label="Find in log"
          value={search.text}
          disabled={disabled}
          onChange={(event) => search.find(event.target.value)}
          placeholder="Find in this log"
          className="h-8 min-w-0 flex-1 rounded-lg border-fine border-line bg-paper px-2.5 text-[13px] disabled:opacity-50"
        />
        <Button size="sm" type="button" disabled={disabled} onClick={search.failures}>
          Failures
        </Button>
      </form>
      {search.source !== null && (
        <div className="flex items-center gap-1.5">
          <span
            role="status"
            className="text-xs font-semibold text-ink-muted tabular-nums"
          >
            {total === 0 ? "No matches" : `${search.at + 1} / ${total}`}
          </span>
          <span className="ml-auto flex gap-1">
            <Button
              size="icon-sm"
              aria-label="Previous match"
              title="Previous match"
              disabled={total === 0}
              onClick={() => search.step(-1)}
            >
              <ChevronUp aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              aria-label="Next match"
              title="Next match"
              disabled={total === 0}
              onClick={() => search.step(1)}
            >
              <ChevronDown aria-hidden />
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
