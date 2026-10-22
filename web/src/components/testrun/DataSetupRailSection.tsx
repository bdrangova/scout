import { cn } from "@/lib/utils";
import { Tag } from "@/components/ui/tag";
import { isDeviation, type Band } from "./data-setup-bands";
import { RunRailSection } from "./RunRailSection";

export interface DataSetupRailSectionProps {
  bands: readonly Band[];
  currentKey: string;
  onSelect: (key: string) => void;
}

/** The Data setup page's block in the session rail: the setup steps (the current one is the card). */
export function DataSetupRailSection({
  bands,
  currentKey,
  onSelect,
}: DataSetupRailSectionProps) {
  return (
    <RunRailSection heading="Setup steps" count={bands.length}>
      <ol
        aria-label="Setup steps"
        className="m-0 flex list-none flex-col gap-1 p-0"
      >
        {bands.map((band) => {
          const current = band.key === currentKey;
          return (
            <li key={band.key}>
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                onClick={() => onSelect(band.key)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border-fine border-transparent px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-hover",
                  current && "border-ink bg-yellow text-on-yellow hover:bg-yellow",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{band.label}</span>
                {band.step !== null && isDeviation(band.step) && (
                  <Tag tone="warn" size="sm">
                    Deviation
                  </Tag>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </RunRailSection>
  );
}
