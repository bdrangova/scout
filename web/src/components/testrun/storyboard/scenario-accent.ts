import type { ScenarioStatus } from "@scout/shared";
import { fileTypeClass, type FileTypeId } from "@/lib/file-type";

/** The accent family a scenario's header, tile band and peek layer wear (the `ft-*` classes the files use for their type). */
const ACCENT: Record<ScenarioStatus, FileTypeId> = {
  pass: "json",
  fail: "css",
  gap: "js",
  uncertain: "js",
  planned: "ts",
  blocked: "yaml",
  na: "other",
};

export function scenarioAccentClass(status: ScenarioStatus): string {
  return fileTypeClass(ACCENT[status]);
}
