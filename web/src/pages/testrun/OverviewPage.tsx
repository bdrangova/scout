import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { PanelView } from "@/components/testrun/panels/registry";
import { RunNotices } from "@/components/testrun/RunNotices";
import { RunStatsHeader } from "@/components/testrun/RunStatsHeader";
import { useTestRunDetail } from "@/lib/detail-kind";

/** The run's overview: the fixed stats header, the index's warnings, then the panels the publish skills chose, two columns wide. */
export function OverviewPage() {
  const detail = useTestRunDetail();
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
          {overview.map((panel, index) => (
            <PanelView key={index} panel={panel} />
          ))}
        </div>
      )}
    </main>
  );
}
