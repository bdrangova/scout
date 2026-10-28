import type { EvidenceRef, Step } from "@scout/shared";
import { basename } from "./scenario-evidence";

/** True when the item belongs to the step: its caption or file name starts with the step's label (`D1`, `D1 seed.png`, `d1-before.png`). */
function belongsTo(item: EvidenceRef, label: string | undefined): boolean {
  if (label === undefined || label.trim() === "") return false;
  const wanted = label.trim().toLowerCase();
  return (
    (item.caption ?? "").toLowerCase().startsWith(wanted) ||
    basename(item.path).toLowerCase().startsWith(wanted)
  );
}

/** A step deviates when its result says so or what was observed is not what was expected. */
export function isDeviation(step: Step): boolean {
  if (step.result !== undefined && /fail|deviat/i.test(step.result))
    return true;
  return (
    step.expected !== undefined &&
    step.observed !== undefined &&
    step.expected.trim() !== step.observed.trim()
  );
}

/** One band of the data setup: a step with the media named after it, or the media no step claims. */
export interface Band {
  key: string;
  /** The band's name: the step's label, `Step n`, or `More evidence`. */
  label: string;
  step: Step | null;
  videos: EvidenceRef[];
  screenshots: EvidenceRef[];
}

/** One band per data-setup step (media joined by label), then a band for the media no step claims. */
export function buildBands(
  steps: readonly Step[],
  videos: readonly EvidenceRef[],
  screenshots: readonly EvidenceRef[],
): Band[] {
  const claimed = (item: EvidenceRef) =>
    steps.some((step) => belongsTo(item, step.label));
  const bands = steps.map(
    (step, index): Band => ({
      key: `${step.label ?? ""}:${index}`,
      label: step.label ?? `Step ${index + 1}`,
      step,
      videos: videos.filter((item) => belongsTo(item, step.label)),
      screenshots: screenshots.filter((item) => belongsTo(item, step.label)),
    }),
  );
  const loose = {
    videos: videos.filter((item) => !claimed(item)),
    screenshots: screenshots.filter((item) => !claimed(item)),
  };
  if (loose.videos.length > 0 || loose.screenshots.length > 0) {
    bands.push({
      key: "more",
      label: steps.length > 0 ? "More evidence" : "Evidence",
      step: null,
      ...loose,
    });
  }
  return bands;
}

