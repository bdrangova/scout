import type { Panel } from "@review-dash/shared";
import { Link } from "react-router";
import { Markdown } from "@/components/common/Markdown";
import { runFileUrl, testRunRoute } from "@/lib/paths";
import { useSessionContext } from "@/lib/session-context";
import { cn } from "@/lib/utils";

type Of<T extends Panel["type"]> = Extract<Panel, { type: T }>;

const TONE_TEXT = {
  good: "text-st-approved",
  bad: "text-st-failed",
  warn: "text-st-updated",
  neutral: "text-ink",
} as const;

export function MarkdownPanel({ panel }: { panel: Of<"markdown"> }) {
  return <Markdown variant="untrusted" source={panel.markdown} />;
}

export function StatsPanel({ panel }: { panel: Of<"stats"> }) {
  return (
    <dl className="m-0 flex flex-wrap gap-x-8 gap-y-3">
      {panel.items.map((item, index) => (
        <div
          key={`${item.label}:${index}`}
          className="flex flex-col gap-0.5"
          title={item.hint}
        >
          <dt className="text-xs font-bold text-ink-muted">{item.label}</dt>
          <dd
            className={cn(
              "m-0 text-2xl leading-none font-bold tabular-nums",
              TONE_TEXT[item.tone ?? "neutral"],
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TablePanel({ panel }: { panel: Of<"table"> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr>
            {panel.columns.map((column, index) => (
              <th
                key={`${column}:${index}`}
                scope="col"
                className="border-b-fine border-line px-2 py-1.5 text-xs font-bold text-ink-muted"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {panel.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border-b-fine border-line/60 px-2 py-1.5 align-top"
                >
                  {cell ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeyValuePanel({ panel }: { panel: Of<"key-value"> }) {
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1.5 text-[13px]">
      {panel.items.map((item, index) => (
        <div key={`${item.key}:${index}`} className="contents">
          <dt className="font-bold text-ink-muted">{item.key}</dt>
          <dd className="m-0 min-w-0 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Only http(s) links are followed; anything else shows as text. */
function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function LinksPanel({ panel }: { panel: Of<"links"> }) {
  const { sessionId } = useSessionContext();
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px] font-semibold">
      {panel.items.map((item, index) => (
        <li key={`${item.label}:${index}`}>
          {item.scenario !== undefined ? (
            <Link
              className="underline underline-offset-2"
              to={testRunRoute(sessionId, "review", item.scenario)}
            >
              {item.label}
            </Link>
          ) : item.ref !== undefined ? (
            <a
              className="underline underline-offset-2"
              href={runFileUrl(sessionId, item.ref)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.label}
            </a>
          ) : item.url !== undefined && isWebUrl(item.url) ? (
            <a
              className="underline underline-offset-2"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.label}
            </a>
          ) : (
            item.label
          )}
        </li>
      ))}
    </ul>
  );
}
