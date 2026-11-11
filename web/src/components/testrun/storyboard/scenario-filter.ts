import { effectiveVerdict, scenarioReviewItem, type Verdict } from "@scout/shared";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useOpenCommentRefs } from "@/components/layout/commented-only";
import { useReview } from "@/state/review-context";
import type { Scenario } from "./scenario-types";

/** A scenario with no verdict but an open comment (on it or its evidence) counts as reviewed, so it gets its own bucket. */
export type ScenarioCategory = Verdict | "commented";
export type ScenarioFilter = "all" | ScenarioCategory;

export const SCENARIO_FILTERS: readonly { id: ScenarioFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "none", label: "Unreviewed" },
  { id: "commented", label: "Commented" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

/** `?show=` on the Review page: one filter for Swipe, Grid and the rail. */
export const FILTER_PARAM = "show";

function parseFilter(value: string | null): ScenarioFilter {
  return SCENARIO_FILTERS.some((option) => option.id === value) ? (value as ScenarioFilter) : "all";
}

/** Open comments of each scenario: on the scenario itself (video moments included) and on its screenshots and data files. */
export function useScenarioOpenComments(): (scenario: Scenario) => number {
  const openRefs = useOpenCommentRefs("scenario", "run-file");
  return useCallback(
    (scenario: Scenario) => {
      const { path, refs = [] } = scenarioReviewItem(scenario);
      return [path, ...refs].reduce((sum, ref) => sum + (openRefs.get(ref) ?? 0), 0);
    },
    [openRefs],
  );
}

export interface ScenarioFilterState {
  filter: ScenarioFilter;
  setFilter: (filter: ScenarioFilter) => void;
  counts: Record<ScenarioFilter, number>;
  /** The scenarios the filter lets through, in order; `keep` (the open one) stays listed even when it no longer matches. */
  visible: readonly Scenario[];
  openComments: (scenario: Scenario) => number;
}

/** The Review page's verdict filter, kept in the URL so switching Swipe / Grid keeps it. */
export function useScenarioFilter(scenarios: readonly Scenario[], keep: string | null): ScenarioFilterState {
  const { fileReview } = useReview();
  const openComments = useScenarioOpenComments();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseFilter(searchParams.get(FILTER_PARAM));

  const categories = useMemo(() => {
    const map = new Map<string, ScenarioCategory>();
    for (const scenario of scenarios) {
      const verdict = effectiveVerdict(fileReview(scenario.id), { path: scenario.id, fingerprint: scenario.fingerprint });
      map.set(scenario.id, verdict === "none" && openComments(scenario) > 0 ? "commented" : verdict);
    }
    return map;
  }, [scenarios, fileReview, openComments]);

  const counts = useMemo(() => {
    const result: Record<ScenarioFilter, number> = { all: scenarios.length, none: 0, commented: 0, approved: 0, rejected: 0 };
    for (const category of categories.values()) result[category] += 1;
    return result;
  }, [scenarios.length, categories]);

  const visible = useMemo(
    () => (filter === "all" ? scenarios : scenarios.filter((scenario) => scenario.id === keep || categories.get(scenario.id) === filter)),
    [filter, scenarios, categories, keep],
  );

  const setFilter = useCallback(
    (next: ScenarioFilter) =>
      setSearchParams(
        (params) => {
          const updated = new URLSearchParams(params);
          if (next === "all") updated.delete(FILTER_PARAM);
          else updated.set(FILTER_PARAM, next);
          return updated;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return { filter, setFilter, counts, visible, openComments };
}
