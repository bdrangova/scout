import type { RunLog } from "@scout/shared";
import { ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { splitLog } from "@/components/testrun/log-lines";
import { LogTile } from "@/components/testrun/LogTile";
import { LogViewer } from "@/components/testrun/LogViewer";
import { LogsRailSection } from "@/components/testrun/LogsRailSection";
import { RunCardDeck } from "@/components/testrun/RunCardDeck";
import { useLogSearch } from "@/components/testrun/useLogSearch";
import { useRunText } from "@/components/testrun/useRunResource";
import { useTestRunDetail } from "@/lib/detail-kind";
import { useSessionContext } from "@/lib/session-context";

/** The rail section and the cards; mounted only while the run has logs, so a selected log always exists. */
function LogsDeck({ logs }: { logs: readonly RunLog[] }) {
  const { sessionId } = useSessionContext();
  const detail = useTestRunDetail();
  const [index, setIndex] = useState(0);
  const selected = logs[Math.min(index, logs.length - 1)] ?? logs[0];
  if (selected === undefined) throw new Error("LogsDeck needs a log");
  // The rail searches the lines the viewer shows: one fetch, shared.
  const text = useRunText(sessionId, selected.path);
  const lines = useMemo(() => splitLog(text.data ?? ""), [text.data]);
  const search = useLogSearch(selected.path, lines);

  return (
    <>
      <LogsRailSection
        sessionId={sessionId}
        logs={logs}
        scenarios={detail.scenarios}
        selected={selected.path}
        onSelect={(path) =>
          setIndex(Math.max(0, logs.findIndex((log) => log.path === path)))
        }
        search={search}
      />
      <RunCardDeck
        label="Logs"
        items={logs}
        itemKey={(log) => log.path}
        index={index}
        onIndexChange={setIndex}
        stepKeys
        renderCard={(log) => (
          <LogViewer
            key={log.path}
            sessionId={sessionId}
            path={log.path}
            label={log.label}
            scenarios={detail.scenarios}
            text={text}
            current={search.current}
          />
        )}
        renderTile={(log, current, open) => (
          <LogTile
            log={log}
            scenarios={detail.scenarios}
            current={current}
            onOpen={open}
          />
        )}
      />
    </>
  );
}

/** `/t/:id/logs`: one card per log (Swipe | Grid), the current one filling the card with scenario-linked lines marked; the list, Find and Failures are in the rail. */
export function LogsPage() {
  const logs = useTestRunDetail().index.logs ?? [];
  return (
    <main className="mx-auto flex w-full max-w-[1300px] flex-col gap-5 px-6 py-6">
      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No logs"
          description="The run published no logs."
        />
      ) : (
        <LogsDeck logs={logs} />
      )}
    </main>
  );
}
