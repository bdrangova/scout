import { Film, Image } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import { isDeviation, type Band } from "./data-setup-bands";
import { RunTile } from "./RunTile";

export interface BandTileProps {
  band: Band;
  current: boolean;
  onOpen: () => void;
}

/** A setup step in the grid: its label, result, a deviation flag and how much media it holds. */
export function BandTile({ band, current, onOpen }: BandTileProps) {
  const { step } = band;
  return (
    <RunTile
      title={band.label}
      current={current}
      onOpen={onOpen}
      detail={
        <>
          {step?.result !== undefined && <Tag size="sm">{step.result}</Tag>}
          {step !== null && isDeviation(step) && (
            <Tag tone="warn" size="sm">
              Deviation
            </Tag>
          )}
          <span className="ml-auto inline-flex items-center gap-2 text-ink-muted tabular-nums">
            {band.videos.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Film aria-hidden className="size-3.5" />
                {band.videos.length}
              </span>
            )}
            {band.screenshots.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Image aria-hidden className="size-3.5" />
                {band.screenshots.length}
              </span>
            )}
          </span>
        </>
      }
    />
  );
}
