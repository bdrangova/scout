import { effectiveVerdict, nextUnreviewedFile, type ReviewItem } from "@review-dash/shared";
import { ListChecks } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { EmptyState } from "@/components/common/EmptyState";
import { clearVerdictUndo, undoLastVerdict } from "@/components/diff/useVerdictAction";
import { ScenarioComplete } from "@/components/testrun/storyboard/ScenarioComplete";
import { ScenarioDeck } from "@/components/testrun/storyboard/ScenarioDeck";
import { ScenarioGrid } from "@/components/testrun/storyboard/ScenarioGrid";
import { ScenarioRailSection } from "@/components/testrun/storyboard/ScenarioRailSection";
import { useScenarioVerdict } from "@/components/testrun/storyboard/useScenarioVerdict";
import { useTestRunDetail } from "@/lib/detail-kind";
import { MODE_PARAM, modeSearch, parseRunMode, readLastCardMode, rememberCardMode } from "@/lib/mode";
import { testRunRoute } from "@/lib/paths";
import { useSessionContext } from "@/lib/session-context";
import { useHotkeys, type HotkeyHandlers } from "@/lib/useHotkeys";
import { useReview } from "@/state/review-context";

/**
 * `/t/:id/review[/:scenarioId]`, the Files page's counterpart with scenarios in place of files: Swipe (`ScenarioDeck`) or
 * Grid (`?mode=grid`, `ScenarioGrid`), the Swipe | Grid toggle in the session bar, the scenario list in the rail, and the
 * end panel once every scenario has a verdict. The URL and `review.ui.currentFile` follow each other.
 */
export function ReviewPage() {
  const { sessionId } = useSessionContext();
  const detail = useTestRunDetail();
  const { state, dispatch } = useReview();
  const verdicts = useScenarioVerdict();
  const params = useParams();
  const { search } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = parseRunMode(searchParams.get(MODE_PARAM));
  const scenarios = useMemo(() => [...detail.scenarios].sort((a, b) => a.order - b.order), [detail.scenarios]);
  const items = useMemo<ReviewItem[]>(() => scenarios.map((scenario) => ({ path: scenario.id, fingerprint: scenario.fingerprint })), [scenarios]);
  const scenarioId = params.scenarioId ?? "";
  const urlScenario = scenarios.find((scenario) => scenario.id === scenarioId) ?? null;
  const urlId = urlScenario?.id ?? null;
  const stateScenario = state.review.ui.currentFile;
  const stateId = stateScenario !== null && scenarios.some((scenario) => scenario.id === stateScenario) ? stateScenario : null;
  const [commentFocusToken, bumpCommentFocus] = useReducer((count: number) => count + 1, 0);
  const previousRef = useRef<{ url: string | null; state: string | null } | null>(null);

  // The undo belongs to this page: leaving it drops the toast.
  useEffect(() => clearVerdictUndo, []);

  // URL ↔ `review.ui.currentFile`: when the URL moves (a link, the back button, the first render) the review follows;
  // when only the review moves (advance, a hotkey) the URL follows. Decided from the values of the previous commit, so
  // StrictMode's double-invoked mount stays idempotent.
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { url: urlId, state: stateId };
    if (urlId === null || urlId === stateId) return;
    const urlMoved = previous === null || previous.url !== urlId;
    const stateMoved = previous !== null && previous.state !== stateId;
    if (stateMoved && !urlMoved && stateId !== null) {
      navigate({ pathname: testRunRoute(sessionId, "review", stateId), search }, { replace: true });
    } else {
      dispatch({ type: "GO_TO", path: urlId });
    }
  }, [urlId, stateId, dispatch, navigate, sessionId, search]);

  // Viewed is tracked by scenario id, in the card modes.
  useEffect(() => {
    if (urlId !== null && mode !== "grid") dispatch({ type: "MARK_VIEWED", path: urlId });
  }, [urlId, mode, dispatch]);

  useEffect(() => {
    if (state.review.ui.mode !== mode) dispatch({ type: "SET_MODE", mode });
    // What the grid's tiles open, and what `G` returns to.
    if (mode !== "grid") rememberCardMode(mode);
  }, [mode, state.review.ui.mode, dispatch]);

  // Nothing left to review: the view gives way to the end panel, only while that holds (a scenario that changed since
  // comes back as unreviewed). Any `GO_TO` (a step, the rail, "Back") leaves it.
  const ended = state.atEnd && nextUnreviewedFile(state.review, items) === null;

  function goTo(id: string) {
    dispatch({ type: "GO_TO", path: id });
  }

  /** A grid tile: back to the card mode the grid was opened from, on that scenario. */
  function openInCards(id: string) {
    const lastMode = parseRunMode(readLastCardMode());
    navigate({ pathname: testRunRoute(sessionId, "review", id), search: modeSearch(new URLSearchParams(searchParams), lastMode) });
  }

  // At the end a step with no neighbour still leaves the end panel, on the current scenario.
  function stepBy(delta: number) {
    if (!urlScenario) return;
    const next = scenarios[scenarios.indexOf(urlScenario) + delta] ?? (ended ? urlScenario : undefined);
    if (next) goTo(next.id);
  }

  // `J` / `K` stay as aliases of the arrows. In the grid the card keys are left alone (a focused tile handles `A` and Enter itself).
  const stepHotkeys: HotkeyHandlers = {
    prev: () => stepBy(-1),
    next: () => stepBy(1),
    prevScenario: () => stepBy(-1),
    nextScenario: () => stepBy(1),
  };
  // Behind the end panel the cards are out of reach: the verdict keys do nothing.
  const cardHotkeys: HotkeyHandlers = {
    ...stepHotkeys,
    approve: () => {
      if (urlScenario) verdicts.approve(urlScenario);
    },
    reject: () => {
      if (!urlScenario) return;
      const rejecting = effectiveVerdict(state.review.files[urlScenario.id], { path: urlScenario.id, fingerprint: urlScenario.fingerprint }) === "rejected" || state.pendingReject === urlScenario.id;
      verdicts.reject(urlScenario);
      // A second `X` clears the verdict (or cancels the pending reject): nothing to type then.
      if (!rejecting) bumpCommentFocus();
    },
    comment: bumpCommentFocus,
  };

  useHotkeys({
    ...(mode === "grid" ? {} : ended ? stepHotkeys : cardHotkeys),
    undo: undoLastVerdict,
    cancel: () => dispatch({ type: "CANCEL_REJECT" }),
  });

  const first = scenarios[0];

  // Keep the current scenario in the URL: the review's own current scenario while it still needs a verdict (after the
  // last approval it stays on the last one, and a scenario that changed since comes back as unreviewed elsewhere), else
  // the next unreviewed scenario, else the current one, else the first.
  if (urlScenario === null && first) {
    const current = stateId === null ? undefined : scenarios.find((scenario) => scenario.id === stateId);
    const settled = current !== undefined && effectiveVerdict(state.review.files[current.id], { path: current.id, fingerprint: current.fingerprint }) !== "none";
    const unreviewed = settled ? nextUnreviewedFile(state.review, items) : null;
    const opening = unreviewed ?? stateId ?? first.id;
    return <Navigate to={{ pathname: testRunRoute(sessionId, "review", opening), search }} replace />;
  }

  const currentId = urlId ?? scenarioId;
  let content: ReactNode;
  if (!first) {
    content = (
      <div className="px-8 py-12">
        <EmptyState icon={ListChecks} title="No scenarios" description="The run's index lists no scenarios to review." />
      </div>
    );
  } else {
    content = (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {mode === "swipe" && (
          <ScenarioDeck
            scenarios={scenarios}
            currentId={currentId}
            detail={detail}
            sessionId={sessionId}
            onNavigate={goTo}
            commentFocusToken={commentFocusToken}
          />
        )}
        {mode === "grid" && (
          <ScenarioGrid
            sessionId={sessionId}
            scenarios={scenarios}
            currentId={currentId}
            onOpen={openInCards}
            onApprove={(scenario) => verdicts.set(scenario, "approved")}
          />
        )}
      </div>
    );
  }

  return (
    <main className="flex h-[calc(100dvh-var(--shell-h))] min-w-0 flex-1 flex-col" data-mode={mode}>
      <ScenarioRailSection scenarios={scenarios} currentId={urlId} onSelect={goTo} />
      {ended && first ? (
        <ScenarioComplete sessionId={sessionId} onBack={() => goTo(currentId)}>
          {content}
        </ScenarioComplete>
      ) : (
        content
      )}
    </main>
  );
}
