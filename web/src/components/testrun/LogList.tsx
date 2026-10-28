import type { RunLog, Scenario } from "@scout/shared";
import { Link } from "react-router";
import { testRunRoute } from "@/lib/paths";
import { cn } from "@/lib/utils";

export interface LogListProps {
  sessionId: string;
  logs: readonly RunLog[];
  scenarios: readonly Scenario[];
  selected: string;
  onSelect: (path: string) => void;
}

/** The run's logs for the rail, each with chips of the scenarios that link to it; the selected one is the current card. */
export function LogList({
  sessionId,
  logs,
  scenarios,
  selected,
  onSelect,
}: LogListProps) {
  return (
    <ul aria-label="Logs" className="m-0 flex list-none flex-col gap-1 p-0">
      {logs.map((log) => {
        const linked = scenarios.filter((scenario) =>
          scenario.logs.some((excerpt) => excerpt.path === log.path),
        );
        const active = log.path === selected;
        return (
          <li
            key={log.path}
            className={cn(
              "flex flex-col gap-1.5 rounded-lg border-fine border-transparent px-2.5 py-2 hover:bg-hover",
              active && "border-ink bg-yellow text-on-yellow hover:bg-yellow",
            )}
          >
            <button
              type="button"
              aria-current={active || undefined}
              onClick={() => onSelect(log.path)}
              className="flex flex-col text-left"
            >
              <span className="text-[13px] font-bold">{log.label}</span>
              <span className="font-mono text-[11px] break-all opacity-80">
                {log.path}
              </span>
            </button>
            {linked.length > 0 && (
              <ul
                aria-label={`Scenarios linked to ${log.label}`}
                className="m-0 flex list-none flex-wrap gap-1.5 p-0"
              >
                {linked.map((scenario) => (
                  <li key={scenario.id} className="min-w-0 max-w-full">
                    <Link
                      to={testRunRoute(sessionId, "review", scenario.id)}
                      title={scenario.title}
                      className="inline-flex h-5 max-w-full items-center rounded-full border-fine border-line bg-paper px-2 text-[11px] font-bold text-ink hover:bg-hover"
                    >
                      <span className="truncate">{scenario.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
