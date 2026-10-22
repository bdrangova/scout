import type { CommentKind, CommentTarget, Scenario } from "@review-dash/shared";
import { MessageSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { CommentBox } from "@/components/common/CommentBox";
import { CommentList } from "@/components/common/CommentList";
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelTitle,
} from "@/components/ui/panel";
import type { AsyncState } from "@/lib/hooks";
import { runFileUrl } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { useReview } from "@/state/review-context";
import { useCommentActions } from "@/state/useCommentActions";
import { CommentKindPicker } from "./CommentKindPicker";
import {
  linkedRangesOf,
  ROW_HEIGHT,
  splitLog,
  VIEWPORT_HEIGHT,
  visibleWindow,
} from "./log-lines";

export interface LogViewerProps {
  sessionId: string;
  /** `alias:path` of the log. */
  path: string;
  label: string;
  scenarios: readonly Scenario[];
  /** The log's text, loaded by the page (the rail's Find and Failures search the same lines). */
  text: AsyncState<string>;
  /** The line the rail's search is on: the viewer scrolls to it. */
  current: number | null;
}

/**
 * The whole log, windowed (only the rows around the scroll position are in the DOM). Lines a scenario links to are tinted and carry a gutter marker;
 * a line number opens the composer for a `log` comment anchored to that line. Find and Failures are in the rail; the current match is scrolled to.
 */
export function LogViewer({
  sessionId,
  path,
  label,
  scenarios,
  text,
  current,
}: LogViewerProps) {
  const { data, error, loading, reload } = text;
  const lines = useMemo(() => splitLog(data ?? ""), [data]);
  const ranges = useMemo(
    () => linkedRangesOf(scenarios, path),
    [scenarios, path],
  );
  const { commentsFor, dispatch } = useReview();
  const actions = useCommentActions();
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [commentLine, setCommentLine] = useState<number | null>(null);
  const [kind, setKind] = useState<CommentKind | null>(null);

  const target: CommentTarget = { kind: "log", ref: path };
  const comments = commentsFor(target);
  const commented = new Set(
    comments.flatMap((comment) =>
      comment.target.anchor ? [comment.target.anchor.line] : [],
    ),
  );
  const { start, end } = visibleWindow(scrollTop, lines.length);

  useEffect(() => {
    if (current === null || !scroller.current) return;
    const top = Math.max(0, (current - 1) * ROW_HEIGHT - VIEWPORT_HEIGHT / 2);
    scroller.current.scrollTop = top;
    setScrollTop(top);
  }, [current, loading]);

  const rangesAt = (line: number) =>
    ranges.filter((range) => line >= range.from && line <= range.to);

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{label}</PanelTitle>
        <span className="font-mono text-xs font-medium text-ink-muted">
          {path}
        </span>
        <a
          className="ml-auto text-xs font-bold underline underline-offset-2"
          href={runFileUrl(sessionId, path)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open
        </a>
      </PanelHeader>
      <AsyncBoundary
        loading={loading}
        error={error}
        onRetry={reload}
        errorLabel="Couldn't load this log"
        empty={lines.length === 0}
        emptyState={
          <PanelBody className="text-[13px] text-ink-muted">
            This log is empty.
          </PanelBody>
        }
      >
        <div
          ref={scroller}
          role="region"
          aria-label={`${label} lines`}
          tabIndex={0}
          style={{ height: VIEWPORT_HEIGHT }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          className="overflow-auto bg-code font-mono text-xs"
        >
          <div
            style={{
              height: lines.length * ROW_HEIGHT,
              paddingTop: start * ROW_HEIGHT,
            }}
            className="relative min-w-max"
          >
            {lines.slice(start, end).map((text, offset) => {
              const line = start + offset + 1;
              const linked = rangesAt(line);
              return (
                <div
                  key={line}
                  data-line={line}
                  data-linked={
                    linked.length > 0
                      ? linked.map((range) => range.scenarioId).join(" ")
                      : undefined
                  }
                  data-current={current === line || undefined}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    "flex items-center gap-2 pr-4 whitespace-pre",
                    linked.length > 0 && "bg-info-bg",
                    current === line && "bg-yellow text-on-yellow",
                  )}
                >
                  <span
                    role={linked.length > 0 ? "img" : undefined}
                    aria-label={
                      linked.length > 0
                        ? `Linked to ${linked.map((range) => range.scenarioTitle).join(", ")}`
                        : undefined
                    }
                    title={
                      linked.map((range) => range.scenarioTitle).join(", ") ||
                      undefined
                    }
                    aria-hidden={linked.length === 0 || undefined}
                    className={cn(
                      "h-full w-1 shrink-0",
                      linked.length > 0 && "bg-info-bd",
                    )}
                  />
                  <button
                    type="button"
                    aria-label={`Comment on line ${line}`}
                    onClick={() => setCommentLine(line)}
                    className="flex w-14 shrink-0 items-center justify-end gap-1 text-right text-ink-muted tabular-nums hover:text-ink"
                  >
                    {commented.has(line) && (
                      <MessageSquare
                        aria-hidden
                        className="size-3 text-focus"
                      />
                    )}
                    {line}
                  </button>
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </AsyncBoundary>
      <PanelBody className="flex flex-col gap-3 border-t-fine border-line">
        {ranges.length > 0 && (
          <p className="m-0 text-xs text-ink-muted">
            Tinted lines are the excerpts scenarios point at:{" "}
            {ranges
              .map(
                (range) => `${range.scenarioTitle} (${range.from}–${range.to})`,
              )
              .join(", ")}
            .
          </p>
        )}
        <CommentList comments={comments} {...actions} />
        {commentLine !== null && (
          <div className="flex flex-col gap-2">
            <CommentKindPicker value={kind} onChange={setKind} />
            <CommentBox
              key={commentLine}
              label={`Comment on line ${commentLine}`}
              pendingReject={false}
              focusToken={1}
              onCancel={() => setCommentLine(null)}
              onCancelReject={() => {}}
              onSubmit={(body) => {
                dispatch({
                  type: "ADD_COMMENT",
                  target: {
                    ...target,
                    anchor: { side: "new", line: commentLine },
                  },
                  body,
                  ...(kind !== null && { kind }),
                });
                setCommentLine(null);
                setKind(null);
              }}
            />
          </div>
        )}
        {commentLine === null && (
          <p className="m-0 text-xs text-ink-muted">
            Click a line number to leave a comment on that line.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
