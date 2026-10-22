import { Bug } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { BugDetail, GapDetail } from "@/components/testrun/BugDetail";
import { BugTile, GapTile } from "@/components/testrun/GapBugTile";
import type { GapBugSelection } from "@/components/testrun/GapsAndBugsLists";
import { GapsRailSection } from "@/components/testrun/GapsRailSection";
import { RunCardDeck } from "@/components/testrun/RunCardDeck";
import { useTestRunDetail } from "@/lib/detail-kind";
import { useSessionContext } from "@/lib/session-context";

/** `/t/:id/gaps`: one card per bug and per known gap (Swipe | Grid); the gaps table and the bugs list are in the rail. */
export function GapsPage() {
  const { sessionId } = useSessionContext();
  const detail = useTestRunDetail();
  const gaps = detail.index.gaps ?? [];
  const bugs = detail.index.bugs ?? [];
  const items: GapBugSelection[] = [
    ...bugs.map((bug): GapBugSelection => ({ kind: "bug", id: bug.slug })),
    ...gaps.map((gap): GapBugSelection => ({ kind: "gap", id: gap.id })),
  ];
  const [index, setIndex] = useState(0);
  const selected = items[Math.min(index, items.length - 1)] ?? null;

  function renderCard(item: GapBugSelection) {
    if (item.kind === "bug") {
      const bug = bugs.find((candidate) => candidate.slug === item.id);
      if (bug === undefined) return null;
      const ticket =
        bug.jira === undefined
          ? undefined
          : detail.manifest.tickets.find((candidate) => candidate.key === bug.jira);
      const jiraUrl =
        bug.jira !== undefined && /^https?:\/\//.test(bug.jira)
          ? bug.jira
          : (ticket?.url ?? undefined);
      return (
        <BugDetail
          key={bug.slug}
          sessionId={sessionId}
          bug={bug}
          scenarios={detail.scenarios}
          jiraUrl={jiraUrl}
        />
      );
    }
    const gap = gaps.find((candidate) => candidate.id === item.id);
    return gap === undefined ? null : (
      <GapDetail
        key={gap.id}
        sessionId={sessionId}
        gap={gap}
        scenarios={detail.scenarios}
      />
    );
  }

  function renderTile(item: GapBugSelection, current: boolean, open: () => void) {
    if (item.kind === "bug") {
      const bug = bugs.find((candidate) => candidate.slug === item.id);
      return bug === undefined ? null : (
        <BugTile bug={bug} current={current} onOpen={open} />
      );
    }
    const gap = gaps.find((candidate) => candidate.id === item.id);
    return gap === undefined ? null : (
      <GapTile gap={gap} current={current} onOpen={open} />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1300px] flex-col gap-5 px-6 py-6">
      {items.length === 0 ? (
        <EmptyState
          icon={Bug}
          title="No gaps or bugs"
          description="The run reported no known gaps and no bugs."
        />
      ) : (
        <>
          <GapsRailSection
            gaps={gaps}
            bugs={bugs}
            selected={selected}
            onSelect={(next) =>
              setIndex(
                Math.max(
                  0,
                  items.findIndex(
                    (item) => item.kind === next.kind && item.id === next.id,
                  ),
                ),
              )
            }
          />
          <RunCardDeck
            label="Gaps and bugs"
            items={items}
            itemKey={(item) => `${item.kind}:${item.id}`}
            index={index}
            onIndexChange={setIndex}
            renderCard={renderCard}
            renderTile={renderTile}
            stepKeys
          />
        </>
      )}
    </main>
  );
}
