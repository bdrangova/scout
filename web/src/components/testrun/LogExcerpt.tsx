import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { useLogSlice } from "./useRunResource";

export interface LogExcerptProps {
  sessionId: string;
  /** `alias:path` of the log. */
  path: string;
  /** 1-based, inclusive. */
  from: number;
  to: number;
  label?: string;
}

/** Lines `from..to` of a run log with their line numbers, fetched from the log endpoint. */
export function LogExcerpt({
  sessionId,
  path,
  from,
  to,
  label,
}: LogExcerptProps) {
  const { data, error, loading, reload } = useLogSlice(
    sessionId,
    path,
    from,
    to,
  );
  return (
    <figure
      data-slot="log-excerpt"
      className="m-0 flex min-w-0 flex-col gap-1.5"
    >
      <figcaption className="text-xs font-semibold text-ink-muted">
        {label !== undefined && <span className="text-ink">{label} · </span>}
        <span className="font-mono font-medium">
          {path}:{from}–{to}
        </span>
      </figcaption>
      <AsyncBoundary
        loading={loading}
        error={error}
        onRetry={reload}
        errorLabel="Couldn't load this log"
      >
        <pre className="m-0 max-h-72 overflow-auto rounded-xl border-fine border-line bg-code p-3 font-mono text-xs leading-relaxed">
          {(data?.lines ?? []).map((line, index) => (
            <div key={index} className="flex gap-3">
              <span
                aria-hidden
                className="w-9 shrink-0 text-right text-ink-muted tabular-nums select-none"
              >
                {(data?.from ?? from) + index}
              </span>
              <span className="whitespace-pre-wrap">{line}</span>
            </div>
          ))}
        </pre>
      </AsyncBoundary>
    </figure>
  );
}
