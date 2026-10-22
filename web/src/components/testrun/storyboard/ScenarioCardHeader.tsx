import { GripVertical, ListChecks } from "lucide-react";
import type { PointerEvent } from "react";
import { Tag } from "@/components/ui/tag";
import { SCENARIO_STATUS_LABEL, SCENARIO_STATUS_TONE } from "@/lib/scenario-status";
import { cn } from "@/lib/utils";
import type { Scenario } from "./scenario-types";

export interface ScenarioCardHeaderProps {
  scenario: Scenario;
  /** `8 / 12` in the header. */
  position?: { index: number; total: number };
  updated: boolean;
  changedJustNow: boolean;
  /** Swipe mode starts the drag from the header. */
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
}

/**
 * The accent strip of the scenario card, the counterpart of the file card's `CardHeader`: the drag handle, the title
 * with its status, "Updated" and layer chips, then the position. The strip takes the scenario status's accent (`bg-ft`).
 */
export function ScenarioCardHeader({ scenario, position, updated, changedJustNow, onPointerDown }: ScenarioCardHeaderProps) {
  const layers = scenario.layers ?? [];
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex shrink-0 items-start gap-3 border-b-fine border-fill-line bg-ft px-4 py-3 text-hdr-ink",
        changedJustNow && "animate-pulse",
        onPointerDown && "cursor-grab select-none",
      )}
      style={onPointerDown ? { touchAction: "none" } : undefined}
      onPointerDown={onPointerDown}
    >
      {onPointerDown && <GripVertical aria-hidden className="mt-0.5 size-4 shrink-0 opacity-60" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="m-0 min-w-0 truncate text-base font-bold" title={scenario.title}>
            {scenario.title}
          </h2>
          <Tag tone={SCENARIO_STATUS_TONE[scenario.status]} className="text-hdr-ink" data-slot="scenario-status">
            {SCENARIO_STATUS_LABEL[scenario.status]}
          </Tag>
          {updated && (
            <Tag tone="warn" className="text-hdr-ink" data-slot="updated-flag" title="The scenario changed since your verdict">
              Updated
            </Tag>
          )}
        </span>
        {layers.length > 0 && (
          <ul aria-label="Layers" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {layers.map((layer) => (
              <li key={layer.name}>
                <Tag tone={SCENARIO_STATUS_TONE[layer.status]} size="sm" className="text-hdr-ink" title={layer.note}>
                  {layer.name} · {SCENARIO_STATUS_LABEL[layer.status]}
                </Tag>
              </li>
            ))}
          </ul>
        )}
      </div>
      {position && (
        <span
          className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-[12.5px] font-semibold whitespace-nowrap tabular-nums"
          title={`Scenario ${position.index + 1} of ${position.total}`}
        >
          <ListChecks aria-hidden className="size-[13px]" />
          <span className="sr-only">
            scenario {position.index + 1} of {position.total}
          </span>
          <span aria-hidden>
            {position.index + 1}
            <span className="opacity-60"> / </span>
            {position.total}
          </span>
        </span>
      )}
    </div>
  );
}
