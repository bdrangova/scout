import { Database } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelTitle,
} from "@/components/ui/panel";
import { BandTile } from "@/components/testrun/BandTile";
import { buildBands } from "@/components/testrun/data-setup-bands";
import { BandCard } from "@/components/testrun/DataSetupBands";
import { DataSetupRailSection } from "@/components/testrun/DataSetupRailSection";
import {
  EnvironmentPanel,
  NotesPanel,
  SnapshotPanel,
} from "@/components/testrun/DataSetupSide";
import { RunCardDeck } from "@/components/testrun/RunCardDeck";
import { StepsTable } from "@/components/testrun/storyboard/StepsTable";
import { useTestRunDetail } from "@/lib/detail-kind";
import { useSessionContext } from "@/lib/session-context";

/** `/t/:id/data-setup`: one card per setup step (Swipe | Grid; the steps list is in the rail), then the test data table, snapshot path, environment and deviations. */
export function DataSetupPage() {
  const { sessionId } = useSessionContext();
  const { index } = useTestRunDetail();
  const setup = index.dataSetup;
  const environment = index.overview.flatMap((panel) =>
    panel.type === "key-value" && /environment/i.test(panel.title ?? "")
      ? [panel.items]
      : [],
  )[0];
  const bands = useMemo(
    () =>
      setup === undefined
        ? []
        : buildBands(setup.steps, setup.videos, setup.screenshots),
    [setup],
  );
  const [position, setPosition] = useState(0);
  const current = bands[Math.min(position, bands.length - 1)];
  const empty =
    setup === undefined ||
    (setup.steps.length === 0 &&
      setup.videos.length === 0 &&
      setup.screenshots.length === 0 &&
      setup.snapshotPath === undefined &&
      setup.notes === undefined);

  return (
    <main className="mx-auto flex w-full max-w-[1300px] flex-col gap-5 px-6 py-6">
      {empty ? (
        <EmptyState
          icon={Database}
          title="No data setup"
          description="The run recorded no data setup steps."
        />
      ) : (
        <>
          {current !== undefined && (
            <>
              <DataSetupRailSection
                bands={bands}
                currentKey={current.key}
                onSelect={(key) =>
                  setPosition(
                    Math.max(0, bands.findIndex((band) => band.key === key)),
                  )
                }
              />
              <RunCardDeck
                label="Setup steps"
                items={bands}
                itemKey={(band) => band.key}
                index={position}
                onIndexChange={setPosition}
                stepKeys
                renderCard={(band) => (
                  <BandCard sessionId={sessionId} band={band} />
                )}
                renderTile={(band, isCurrent, open) => (
                  <BandTile band={band} current={isCurrent} onOpen={open} />
                )}
              />
            </>
          )}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            {setup.steps.length > 0 && (
              <Panel>
                <PanelHeader>
                  <PanelTitle>Test data</PanelTitle>
                </PanelHeader>
                <PanelBody>
                  <StepsTable steps={setup.steps} />
                </PanelBody>
              </Panel>
            )}
            {setup.snapshotPath !== undefined && (
              <SnapshotPanel path={setup.snapshotPath} />
            )}
            {environment !== undefined && (
              <EnvironmentPanel items={environment} />
            )}
            {setup.notes !== undefined && <NotesPanel markdown={setup.notes} />}
          </div>
        </>
      )}
    </main>
  );
}
