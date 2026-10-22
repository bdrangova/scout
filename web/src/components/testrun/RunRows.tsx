import type {
  Bug,
  Gap,
  LogExcerpt as LogExcerptRef,
} from "@review-dash/shared";
import { Link } from "react-router";
import { Markdown } from "@/components/common/Markdown";
import { Tag } from "@/components/ui/tag";
import { runFileUrl, testRunRoute } from "@/lib/paths";
import { CollapsibleRow } from "./CollapsibleRow";
import { LogExcerpt } from "./LogExcerpt";

export interface LinkedGapsAndBugsProps {
  sessionId: string;
  /** Gap ids and bug slugs the scenario links to. */
  gapIds: readonly string[];
  bugSlugs: readonly string[];
  gaps: readonly Gap[];
  bugs: readonly Bug[];
  /** The run has a Gaps & bugs page to link to. */
  hasGapsPage: boolean;
}

/** The collapsible row of the gaps and bugs a scenario links to (an id the index does not define stays visible as plain text). */
export function LinkedGapsAndBugs({
  sessionId,
  gapIds,
  bugSlugs,
  gaps,
  bugs,
  hasGapsPage,
}: LinkedGapsAndBugsProps) {
  const count = gapIds.length + bugSlugs.length;
  if (count === 0) return null;
  return (
    <CollapsibleRow title="Linked gaps and bugs" summary={count}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
        {gapIds.map((id) => {
          const gap = gaps.find((candidate) => candidate.id === id);
          return (
            <li key={`gap:${id}`} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2 font-semibold">
                <Tag tone="warn" size="sm">
                  Gap
                </Tag>
                {gap?.title ?? id}
                {gap !== undefined && (
                  <Tag size="sm" mono>
                    {gap.status}
                  </Tag>
                )}
              </span>
              {gap?.markdown !== undefined && (
                <Markdown variant="untrusted" source={gap.markdown} />
              )}
            </li>
          );
        })}
        {bugSlugs.map((slug) => {
          const bug = bugs.find((candidate) => candidate.slug === slug);
          return (
            <li
              key={`bug:${slug}`}
              className="flex flex-wrap items-center gap-2 font-semibold"
            >
              <Tag tone="err" size="sm">
                Bug
              </Tag>
              {bug !== undefined ? (
                <a
                  className="underline underline-offset-2"
                  href={runFileUrl(sessionId, bug.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {bug.title}
                </a>
              ) : (
                slug
              )}
              {bug?.jira !== undefined && (
                <Tag size="sm" mono>
                  {bug.jira}
                </Tag>
              )}
            </li>
          );
        })}
      </ul>
      {hasGapsPage && (
        <Link
          className="w-fit text-xs font-bold underline underline-offset-2"
          to={testRunRoute(sessionId, "gaps")}
        >
          Open Gaps and bugs
        </Link>
      )}
    </CollapsibleRow>
  );
}

export function LogExcerptsRow({
  sessionId,
  logs,
}: {
  sessionId: string;
  logs: readonly LogExcerptRef[];
}) {
  if (logs.length === 0) return null;
  return (
    <CollapsibleRow title="Log excerpts" summary={logs.length}>
      {logs.map((log, index) => (
        <LogExcerpt
          key={`${log.path}:${log.from}:${index}`}
          sessionId={sessionId}
          path={log.path}
          from={log.from}
          to={log.to}
          label={log.label}
        />
      ))}
    </CollapsibleRow>
  );
}

export function NotesRow({ notes }: { notes: string | undefined }) {
  if (notes === undefined || notes.trim() === "") return null;
  return (
    <CollapsibleRow title="Notes">
      <Markdown variant="untrusted" source={notes} />
    </CollapsibleRow>
  );
}
