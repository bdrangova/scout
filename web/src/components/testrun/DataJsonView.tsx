import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { useRunText } from "./useRunResource";

/** Pretty-prints JSON text; anything that does not parse is shown as it is. */
function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export interface DataJsonViewProps {
  sessionId: string;
  /** `alias:path` of the data file. */
  path: string;
  caption?: string;
}

/** A scenario's data file, fetched and pretty printed. */
export function DataJsonView({ sessionId, path, caption }: DataJsonViewProps) {
  const { data, error, loading, reload } = useRunText(sessionId, path);
  return (
    <figure data-slot="data-json" className="m-0 flex min-w-0 flex-col gap-1.5">
      <figcaption className="text-xs font-semibold text-ink-muted">
        {caption !== undefined && (
          <span className="text-ink">{caption} · </span>
        )}
        <span className="font-mono font-medium">{path}</span>
      </figcaption>
      <AsyncBoundary
        loading={loading}
        error={error}
        onRetry={reload}
        errorLabel="Couldn't load this file"
      >
        <pre className="m-0 max-h-72 overflow-auto rounded-xl border-fine border-line bg-code p-3 font-mono text-xs leading-relaxed">
          {prettyJson(data ?? "")}
        </pre>
      </AsyncBoundary>
    </figure>
  );
}
