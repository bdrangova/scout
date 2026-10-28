import type { EvidenceRef, Scenario } from "@scout/shared";

export type EvidenceKind = "video" | "image" | "data";

/** One card of a scenario's evidence deck. */
export interface EvidenceEntry {
  kind: EvidenceKind;
  ref: EvidenceRef;
}

/** The scenario's videos, then screenshots, then data files: one card each. */
export function evidenceEntries(evidence: Scenario["evidence"]): EvidenceEntry[] {
  return [
    ...evidence.videos.map((ref): EvidenceEntry => ({ kind: "video", ref })),
    ...evidence.screenshots.map((ref): EvidenceEntry => ({ kind: "image", ref })),
    ...evidence.data.map((ref): EvidenceEntry => ({ kind: "data", ref })),
  ];
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function entryName(entry: EvidenceEntry): string {
  return entry.ref.caption ?? basename(entry.ref.path);
}

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  video: "Video",
  image: "Screenshot",
  data: "Data file",
};
