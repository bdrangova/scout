import { useMemo, useState } from "react";
import { FAILURE_PATTERN, matchingLines } from "./log-lines";

type Source = "find" | "failures";

interface SearchState {
  path: string;
  source: Source;
  text: string;
  at: number;
}

export interface LogSearch {
  source: Source | null;
  /** The Find box's text (empty while Failures is the source). */
  text: string;
  /** 1-based numbers of the matching lines. */
  matches: readonly number[];
  /** Index into `matches` of the current one. */
  at: number;
  /** The current match's line number, for the viewer to scroll to. */
  current: number | null;
  find: (text: string) => void;
  /** The first failure, or the next one when Failures is already the source. */
  failures: () => void;
  step: (delta: number) => void;
  clear: () => void;
}

/**
 * Find and Failures of the Logs page, held by the page so the rail can drive them while the viewer shows the lines.
 * Moving to another log drops the search.
 */
export function useLogSearch(path: string, lines: readonly string[]): LogSearch {
  const [stored, setStored] = useState<SearchState | null>(null);
  const state = stored?.path === path ? stored : null;
  const matches = useMemo(() => {
    if (state === null) return [];
    if (state.source === "failures")
      return matchingLines(lines, (line) => FAILURE_PATTERN.test(line));
    const needle = state.text.toLowerCase();
    return needle === ""
      ? []
      : matchingLines(lines, (line) => line.toLowerCase().includes(needle));
  }, [state, lines]);
  const at = state === null || matches.length === 0 ? 0 : state.at % matches.length;

  function step(delta: number) {
    if (state === null || matches.length === 0) return;
    setStored({ ...state, at: (at + delta + matches.length) % matches.length });
  }

  return {
    source: state?.source ?? null,
    text: state?.source === "find" ? state.text : "",
    matches,
    at,
    current: matches[at] ?? null,
    find: (text) =>
      setStored(text === "" ? null : { path, source: "find", text, at: 0 }),
    failures: () => {
      if (state?.source === "failures" && matches.length > 0) return step(1);
      setStored({ path, source: "failures", text: "", at: 0 });
    },
    step,
    clear: () => setStored(null),
  };
}
