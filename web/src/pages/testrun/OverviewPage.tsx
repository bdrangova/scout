import type { Panel } from "@scout/shared";
import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { PanelView } from "@/components/testrun/panels/registry";
import { RunMarkdownCard } from "@/components/testrun/RunMarkdownCard";
import { RunNotices } from "@/components/testrun/RunNotices";
import { RunStatsHeader } from "@/components/testrun/RunStatsHeader";
import { useTestRunDetail } from "@/lib/detail-kind";
import { useSessionContext } from "@/lib/session-context";

type Block =
  | { kind: "panel"; panel: Panel }
  | { kind: "markdown-file"; fileRef: string; title: string };

/** A markdown file of the run's plan folder: `plan:test-plan.md`. */
const isPlanMarkdown = (ref: string | undefined): ref is string =>
  ref !== undefined && /^plan:.+\.md$/i.test(ref);

/** A links panel's plan `.md` files come out as their own cards, shown like extras; its other links stay a links panel. */
function toBlocks(overview: readonly Panel[]): Block[] {
  return overview.flatMap((panel): Block[] => {
    if (panel.type !== "links") return [{ kind: "panel", panel }];
    const files = panel.items.filter((item) => item.scenario === undefined && isPlanMarkdown(item.ref));
    if (files.length === 0) return [{ kind: "panel", panel }];
    const rest = panel.items.filter((item) => !files.includes(item));
    return [
      ...files.map((item): Block => ({ kind: "markdown-file", fileRef: item.ref!, title: item.label })),
      ...(rest.length > 0 ? [{ kind: "panel" as const, panel: { ...panel, items: rest } }] : []),
    ];
  });
}

/** The run's overview: the fixed stats header, the index's warnings, then the panels the publish skills chose, two columns wide. */
export function OverviewPage() {
  const detail = useTestRunDetail();
  const { sessionId } = useSessionContext();
  const { overview } = detail.index;
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-6 py-6">
      <PageHeader title="Overview" />
      <RunStatsHeader scenarios={detail.scenarios} />
      <RunNotices warnings={detail.warnings} missing={detail.missing} />
      {overview.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No overview panels"
          description="The publish skills did not choose any panels for this run."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {toBlocks(overview).map((block, index) =>
            block.kind === "panel" ? (
              <PanelView key={index} panel={block.panel} />
            ) : (
              <RunMarkdownCard
                key={index}
                sessionId={sessionId}
                fileRef={block.fileRef}
                title={block.title}
                className="md:col-span-2"
              />
            ),
          )}
        </div>
      )}
    </main>
  );
}
