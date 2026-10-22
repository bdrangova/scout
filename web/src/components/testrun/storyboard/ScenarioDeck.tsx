import { effectiveVerdict, type TestRunDetail, type Verdict } from "@review-dash/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { PEEK_COUNT, PEEK_INSET, PEEK_RISE, useExitDirection, type ExitDirection } from "@/components/diff/deck-motion";
import { NavButton, SwipeFrame } from "@/components/diff/DeckParts";
import { cn } from "@/lib/utils";
import { useReview } from "@/state/review-context";
import { ScenarioReviewCard } from "./ScenarioReviewCard";
import { scenarioAccentClass } from "./scenario-accent";
import type { Scenario } from "./scenario-types";
import { useScenarioVerdict } from "./useScenarioVerdict";

export interface ScenarioDeckProps {
  /** In display order. */
  scenarios: readonly Scenario[];
  currentId: string;
  detail: TestRunDetail;
  sessionId: string;
  onNavigate: (id: string) => void;
  /** Bump to focus the current card's comment box. */
  commentFocusToken?: number;
}

/**
 * Swipe mode of the Review page, the file deck's counterpart: one scenario card at a time with the next ones as layers
 * behind it, dragged from its header (right approves, left rejects; a reject with no comment waits for one), the round
 * previous / next buttons and the `n / N` counter. The verdict advances through the review's own `advance`.
 */
export function ScenarioDeck({ scenarios, currentId, detail, sessionId, onNavigate, commentFocusToken = 0 }: ScenarioDeckProps) {
  const { fileReview, commentsFor } = useReview();
  const verdicts = useScenarioVerdict();
  const foundIndex = scenarios.findIndex((scenario) => scenario.id === currentId);
  const index = foundIndex === -1 ? 0 : foundIndex;
  const current = scenarios[index];

  function signatureOf(id: string): { verdict: Verdict; openComments: number } {
    const scenario = scenarios.find((candidate) => candidate.id === id);
    return {
      // A card whose scenario is gone keeps its stored verdict for the fly-off direction.
      verdict: scenario ? effectiveVerdict(fileReview(id), { path: id, fingerprint: scenario.fingerprint }) : (fileReview(id)?.verdict ?? "none"),
      openComments: commentsFor({ kind: "scenario", ref: id }).filter((comment) => comment.status === "open").length,
    };
  }

  const exitDirection: ExitDirection = useExitDirection(currentId, signatureOf);

  function commit(direction: "left" | "right") {
    if (current) verdicts.set(current, direction === "right" ? "approved" : "rejected");
  }

  function step(delta: number) {
    const next = scenarios[index + delta];
    if (next) onNavigate(next.id);
  }

  return (
    <div className="flex min-h-0 flex-1 items-stretch justify-center gap-3 px-4 pt-11 pb-5 md:gap-5 md:px-7">
      <NavButton label="Previous scenario" disabled={index === 0} onClick={() => step(-1)}>
        <ChevronLeft aria-hidden />
      </NavButton>

      <div className="flex w-full max-w-[1200px] min-w-0 flex-1 flex-col gap-3">
        <div className="relative flex min-h-[560px] flex-1">
          {/* The next scenarios in the queue show as layers behind the card, in their status accent. */}
          {Array.from({ length: PEEK_COUNT }, (_, i) => PEEK_COUNT - i).map((offset) => {
            const peek = scenarios[index + offset];
            if (!peek) return null;
            return (
              <div
                key={peek.id}
                aria-hidden
                data-slot="deck-peek"
                className={cn(scenarioAccentClass(peek.status), "absolute h-11 rounded-3xl border-fine border-fill-line bg-ft")}
                style={{ left: PEEK_INSET * offset, right: PEEK_INSET * offset, top: -PEEK_RISE * offset }}
              />
            );
          })}
          <AnimatePresence initial={false} custom={exitDirection}>
            {current && (
              <SwipeFrame key={current.id} exitDirection={exitDirection} onCommit={commit}>
                {(startDrag) => (
                  <ScenarioReviewCard
                    scenario={current}
                    detail={detail}
                    sessionId={sessionId}
                    position={{ index, total: scenarios.length }}
                    commentFocusToken={commentFocusToken}
                    onHeaderPointerDown={startDrag}
                    className="h-full"
                  />
                )}
              </SwipeFrame>
            )}
          </AnimatePresence>
        </div>
        <p className="text-center text-[12.5px] font-semibold text-ink-muted tabular-nums" aria-live="polite">
          {index + 1} / {scenarios.length}
        </p>
      </div>

      <NavButton label="Next scenario" disabled={index >= scenarios.length - 1} onClick={() => step(1)}>
        <ChevronRight aria-hidden />
      </NavButton>
    </div>
  );
}
