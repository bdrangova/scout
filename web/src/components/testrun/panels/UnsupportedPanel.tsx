import type { Panel } from "@review-dash/shared";

/** A panel this dashboard version cannot draw: its type and a muted line, so the gap is visible but harmless. */
export function UnsupportedPanel({
  panel,
}: {
  panel: Extract<Panel, { type: "unsupported" }>;
}) {
  return (
    <div
      data-slot="unsupported-panel"
      className="flex flex-col gap-1 text-[13px]"
    >
      <span className="font-mono font-bold">{panel.originalType}</span>
      <span className="text-ink-muted">
        {panel.reason === "invalid-shape"
          ? "This panel has a malformed body."
          : "Panel type not supported by this dashboard version."}
      </span>
    </div>
  );
}
