import type { Scenario } from "@scout/shared";

export const ROW_HEIGHT = 20;
export const VIEWPORT_HEIGHT = 480;
/** Rows rendered above and below the viewport, so a fast scroll never shows a blank. */
const OVERSCAN = 180;

export const FAILURE_PATTERN = /fail|error|×/i;

/** The lines of a log's text (a trailing newline does not add an empty last line). */
export function splitLog(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export interface LinkedRange {
  from: number;
  to: number;
  scenarioId: string;
  scenarioTitle: string;
  label?: string;
}

/** The line ranges of one log that scenarios point at (1-based, inclusive). */
export function linkedRangesOf(
  scenarios: readonly Scenario[],
  path: string,
): LinkedRange[] {
  return scenarios.flatMap((scenario) =>
    scenario.logs
      .filter((log) => log.path === path)
      .map((log) => ({
        from: log.from,
        to: log.to,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        ...(log.label !== undefined && { label: log.label }),
      })),
  );
}

/** The rows `[start, end)` to render for a scroll position. */
export function visibleWindow(
  scrollTop: number,
  total: number,
): { start: number; end: number } {
  const first = Math.floor(scrollTop / ROW_HEIGHT);
  const count = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT);
  return {
    start: Math.max(0, first - OVERSCAN),
    end: Math.min(total, first + count + OVERSCAN),
  };
}

/** 1-based numbers of the lines the test accepts. */
export function matchingLines(
  lines: readonly string[],
  test: (line: string) => boolean,
): number[] {
  return lines.flatMap((line, index) => (test(line) ? [index + 1] : []));
}
