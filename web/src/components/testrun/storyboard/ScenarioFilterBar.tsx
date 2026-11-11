import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { SCENARIO_FILTERS, type ScenarioFilter } from "./scenario-filter";

export interface ScenarioFilterBarProps {
  value: ScenarioFilter;
  counts: Record<ScenarioFilter, number>;
  onChange: (filter: ScenarioFilter) => void;
}

/** All · Unreviewed · Commented · Approved · Rejected, with counts: the Review page's filter in every view. */
export function ScenarioFilterBar({ value, counts, onChange }: ScenarioFilterBarProps) {
  return (
    <Segmented aria-label="Show scenarios" className="max-w-full self-start overflow-x-auto overflow-y-hidden">
      {SCENARIO_FILTERS.map((option) => (
        <SegmentedItem
          key={option.id}
          pressed={option.id === value}
          count={counts[option.id]}
          onClick={() => onChange(option.id)}
          className="h-7 px-3"
        >
          {option.label}
        </SegmentedItem>
      ))}
    </Segmented>
  );
}
