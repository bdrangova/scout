import { effectiveVerdict, fileIsUpdated, type TestRunDetail } from "@review-dash/shared";
import { useEffect, useReducer, useState, type PointerEvent } from "react";
import { Markdown } from "@/components/common/Markdown";
import { CardActions } from "@/components/diff/CardActions";
import { VerdictOverlay } from "@/components/diff/VerdictOverlay";
import { draftKey } from "@/lib/comment-drafts";
import { cn } from "@/lib/utils";
import { useReview } from "@/state/review-context";
import { RunEvidenceCard } from "../RunEvidenceCard";
import { LinkedGapsAndBugs, LogExcerptsRow, NotesRow } from "../RunRows";
import type { Chapter } from "../RunVideo";
import { basename, evidenceEntries } from "../scenario-evidence";
import { EvidenceCarousel } from "./EvidenceCarousel";
import { ScenarioCardHeader } from "./ScenarioCardHeader";
import { ScenarioComments } from "./ScenarioComments";
import { scenarioAccentClass } from "./scenario-accent";
import type { Scenario } from "./scenario-types";
import { StepsTable } from "./StepsTable";
import { useScenarioVerdict } from "./useScenarioVerdict";

export interface ScenarioReviewCardProps {
  scenario: Scenario;
  detail: TestRunDetail;
  sessionId: string;
  /** `8 / 12` in the header. */
  position?: { index: number; total: number };
  /** Bump to focus this card's comment box (the `C` hotkey). */
  commentFocusToken?: number;
  /** Swipe mode starts the drag from the header. */
  onHeaderPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  className?: string;
}

/** How long the "changed just now" pulse stays on the header after the scenario moved on disk. */
const CHANGED_PULSE_MS = 2500;

/**
 * The counterpart of the file card: header, a scrolling body (steps, the evidence as an inner carousel of cards,
 * the collapsible rows), then the scenario's comments and the Approve / Reject / Comment footer. The verdict is the
 * scenario's, keyed by its id and pinned to its fingerprint.
 */
export function ScenarioReviewCard({ scenario, detail, sessionId, position, commentFocusToken = 0, onHeaderPointerDown, className }: ScenarioReviewCardProps) {
  const { state, fileReview, commentsFor, draftFor } = useReview();
  const verdicts = useScenarioVerdict();
  const [localFocus, bumpLocalFocus] = useReducer((count: number) => count + 1, 0);
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null);
  const [cardIndex, setCardIndex] = useState(0);

  const item = { path: scenario.id, fingerprint: scenario.fingerprint };
  const review = fileReview(scenario.id);
  const verdict = effectiveVerdict(review, item);
  const updated = fileIsUpdated(review, item);
  const pendingReject = state.pendingReject === scenario.id;
  const comments = commentsFor({ kind: "scenario", ref: scenario.id });
  const draftBody = draftFor(draftKey({ kind: "scenario", ref: scenario.id })).trim();

  // The scenario's evidence moved on disk while this card was mounted: pulse the header briefly.
  const [seenFingerprint, setSeenFingerprint] = useState(scenario.fingerprint);
  const [changedJustNow, setChangedJustNow] = useState(false);
  if (seenFingerprint !== scenario.fingerprint) {
    setSeenFingerprint(scenario.fingerprint);
    setChangedJustNow(true);
  }
  useEffect(() => {
    if (!changedJustNow) return;
    const timer = window.setTimeout(() => setChangedJustNow(false), CHANGED_PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [changedJustNow, seenFingerprint]);

  const entries = evidenceEntries(scenario.evidence);
  const chapters: Chapter[] = scenario.evidence.screenshots.flatMap((shot) =>
    shot.atSec === undefined ? [] : [{ atSec: shot.atSec, label: shot.caption ?? basename(shot.path) }],
  );
  const timedComments = comments.filter((comment) => comment.timestampSec !== null);
  const { index } = detail;

  return (
    <article
      aria-label={scenario.title}
      data-scenario={scenario.id}
      data-verdict={verdict}
      data-changed={changedJustNow || undefined}
      className={cn(
        scenarioAccentClass(scenario.status),
        "relative flex flex-col overflow-hidden rounded-2xl border-fine border-line bg-surface text-ink transition-[border-color]",
        pendingReject && "border-red",
        className,
      )}
    >
      <VerdictOverlay verdict={verdict} commented={comments.some((comment) => comment.status === "open")} pendingReject={pendingReject} />

      <ScenarioCardHeader scenario={scenario} position={position} updated={updated} changedJustNow={changedJustNow} onPointerDown={onHeaderPointerDown} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pt-4 pb-3">
        {scenario.steps !== undefined && scenario.steps.length > 0 ? (
          <StepsTable steps={scenario.steps} />
        ) : (
          scenario.stepsMarkdown !== undefined && <Markdown variant="untrusted" source={scenario.stepsMarkdown} />
        )}

        {entries.length > 0 ? (
          <EvidenceCarousel
            sessionId={sessionId}
            entries={entries}
            index={cardIndex}
            onIndexChange={setCardIndex}
            renderCard={(entry) => (
              <RunEvidenceCard
                sessionId={sessionId}
                entry={entry}
                chapters={chapters}
                timedComments={timedComments}
                onCommentAt={(seconds) => {
                  setPendingTimestamp(seconds);
                  bumpLocalFocus();
                }}
              />
            )}
          />
        ) : (
          <p className="m-0 text-xs text-ink-muted">No evidence.</p>
        )}

        <div className="flex flex-col">
          <LinkedGapsAndBugs
            sessionId={sessionId}
            gapIds={scenario.links.gaps}
            bugSlugs={scenario.links.bugs}
            gaps={index.gaps ?? []}
            bugs={index.bugs ?? []}
            hasGapsPage={index.pages.includes("gaps")}
          />
          <LogExcerptsRow sessionId={sessionId} logs={scenario.logs} />
          <NotesRow notes={scenario.notes} />
        </div>
      </div>

      <section aria-label={`Comments on ${scenario.title}`} className="flex shrink-0 flex-col gap-3 border-t-fine border-line bg-surface px-4 pt-3.5 pb-4">
        <ScenarioComments
          scenarioId={scenario.id}
          title={scenario.title}
          pendingReject={pendingReject}
          focusToken={localFocus + commentFocusToken}
          pendingTimestamp={pendingTimestamp}
          onClearTimestamp={() => setPendingTimestamp(null)}
        />
        <CardActions
          verdict={verdict}
          pendingReject={pendingReject}
          reviewable
          hasDraft={draftBody !== ""}
          onApprove={() => verdicts.approve(scenario)}
          onReject={() => verdicts.reject(scenario)}
          onComment={bumpLocalFocus}
        />
      </section>
    </article>
  );
}
