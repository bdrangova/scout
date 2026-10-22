import { TriangleAlert } from "lucide-react";

export interface RunNoticesProps {
  warnings: readonly string[];
  /** Referenced `alias:path`s that are not on disk. */
  missing: readonly string[];
}

/** A compact notice for what the server found wrong in the index: warnings and missing files, both folded open on demand. Nothing when the run is clean. */
export function RunNotices({ warnings, missing }: RunNoticesProps) {
  if (warnings.length === 0 && missing.length === 0) return null;
  const parts = [
    warnings.length > 0
      ? `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`
      : null,
    missing.length > 0
      ? `${missing.length} missing ${missing.length === 1 ? "file" : "files"}`
      : null,
  ].filter((part) => part !== null);
  return (
    <details
      data-slot="run-notices"
      className="rounded-xl border-fine border-warn-bd/50 bg-warn-bg px-3.5 py-2 text-[12.5px]"
    >
      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
        <TriangleAlert aria-hidden className="size-4 shrink-0" />
        The index has {parts.join(" and ")}
      </summary>
      <div className="flex flex-col gap-2 pt-2">
        {warnings.length > 0 && (
          <ul aria-label="Warnings" className="m-0 list-disc pl-5">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        )}
        {missing.length > 0 && (
          <ul
            aria-label="Missing files"
            className="m-0 list-disc pl-5 font-mono text-xs"
          >
            {missing.map((ref) => (
              <li key={ref}>{ref}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
