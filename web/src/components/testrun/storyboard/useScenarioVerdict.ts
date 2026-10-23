import { effectiveVerdict, type Verdict } from "@review-dash/shared";
import { useCallback, useEffect, useRef } from "react";
import { announceVerdict, useVerdictAction } from "@/components/diff/useVerdictAction";
import { draftKey } from "@/lib/comment-drafts";
import { useReview } from "@/state/review-context";

export interface VerdictTarget {
  id: string;
  title: string;
  fingerprint: string;
}

export interface ScenarioVerdicts {
  /** Approve / reject as a toggle (the buttons and the `A` / `X` keys). */
  approve: (scenario: VerdictTarget) => void;
  reject: (scenario: VerdictTarget) => void;
  /** Set the verdict as is, no toggle (a swipe, a grid tile). True when a comment went with it. */
  set: (scenario: VerdictTarget, verdict: Exclude<Verdict, "none">) => boolean;
}

/**
 * Approve / reject a scenario as a toggle: choosing the verdict the scenario already has clears it (`none`), with a
 * "Cleared verdict · Undo" toast (`Z` undoes it too). Anything else is `useVerdictAction` (a reject without a comment waits
 * for one; pressing Reject again then cancels it).
 */
export function useScenarioVerdict(): ScenarioVerdicts {
  const { state, dispatch, fileReview, draftFor } = useReview();
  const sendVerdict = useVerdictAction();
  const reviewRef = useRef(state.review);
  useEffect(() => {
    reviewRef.current = state.review;
  });

  const clear = useCallback(
    (scenario: VerdictTarget) => {
      const before = reviewRef.current.files[scenario.id];
      dispatch({ type: "SET_VERDICT", path: scenario.id, verdict: "none", fingerprint: null });
      announceVerdict(`Cleared verdict · ${scenario.title}`, () => {
        const review = reviewRef.current;
        if (before) dispatch({ type: "LOAD", review: { ...review, files: { ...review.files, [scenario.id]: before } } });
        dispatch({ type: "GO_TO", path: scenario.id });
      });
    },
    [dispatch],
  );

  const set = (scenario: VerdictTarget, verdict: Exclude<Verdict, "none">) =>
    sendVerdict(scenario.id, verdict, scenario.fingerprint, scenario.title, false);

  const choose = (scenario: VerdictTarget, verdict: Exclude<Verdict, "none">) => {
    const current = effectiveVerdict(fileReview(scenario.id), { path: scenario.id, fingerprint: scenario.fingerprint });
    if (current === verdict) return clear(scenario);
    if (
      verdict === "rejected" &&
      state.pendingReject === scenario.id &&
      draftFor(draftKey({ kind: "scenario", ref: scenario.id })).trim() === ""
    ) {
      return dispatch({ type: "CANCEL_REJECT" });
    }
    set(scenario, verdict);
  };

  return {
    approve: (scenario) => choose(scenario, "approved"),
    reject: (scenario) => choose(scenario, "rejected"),
    set,
  };
}
