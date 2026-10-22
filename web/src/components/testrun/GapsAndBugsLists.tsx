import type { Bug, Gap } from "@review-dash/shared";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";

export type GapBugSelection =
  | { kind: "gap"; id: string }
  | { kind: "bug"; id: string };

export interface GapsAndBugsListsProps {
  gaps: readonly Gap[];
  bugs: readonly Bug[];
  selected: GapBugSelection | null;
  onSelect: (selection: GapBugSelection) => void;
}

const ROW =
  "flex w-full items-center gap-2 rounded-lg border-fine border-transparent px-2.5 py-2 text-left text-[13px] hover:bg-hover";
const CURRENT = "border-ink bg-yellow text-on-yellow hover:bg-yellow";

/** The Gaps & bugs page's lists, for the rail: the known gaps as a table, the bugs as a list; the selected row is the current card. */
export function GapsAndBugsLists({
  gaps,
  bugs,
  selected,
  onSelect,
}: GapsAndBugsListsProps) {
  const isSelected = (kind: "gap" | "bug", id: string) =>
    selected?.kind === kind && selected.id === id;
  return (
    <>
      <section aria-label="Known gaps section" className="flex flex-col gap-1">
        <h3 className="m-0 flex items-center gap-2 px-2.5 text-xs font-bold text-ink-muted">
          Known gaps
          <span className="tabular-nums">{gaps.length}</span>
        </h3>
        {gaps.length === 0 ? (
          <p className="m-0 px-2.5 text-[13px] text-ink-muted">No gaps.</p>
        ) : (
          <table
            aria-label="Known gaps"
            className="w-full border-collapse text-left text-[13px]"
          >
            <thead className="sr-only">
              <tr>
                <th scope="col">Gap</th>
                <th scope="col">Status</th>
                <th scope="col">Scenarios</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((gap) => (
                <tr
                  key={gap.id}
                  data-selected={isSelected("gap", gap.id) || undefined}
                >
                  <td colSpan={3} className="p-0">
                    <button
                      type="button"
                      aria-current={isSelected("gap", gap.id) || undefined}
                      onClick={() => onSelect({ kind: "gap", id: gap.id })}
                      className={cn(ROW, isSelected("gap", gap.id) && CURRENT)}
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {gap.title}
                      </span>
                      <Tag size="sm" mono>
                        {gap.status}
                      </Tag>
                      <span
                        className="font-mono text-xs tabular-nums"
                        title={`${gap.scenarios.length} scenarios`}
                      >
                        {gap.scenarios.length}
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Bugs section" className="flex flex-col gap-1">
        <h3 className="m-0 flex items-center gap-2 px-2.5 text-xs font-bold text-ink-muted">
          Bugs
          <span className="tabular-nums">{bugs.length}</span>
        </h3>
        {bugs.length === 0 ? (
          <p className="m-0 px-2.5 text-[13px] text-ink-muted">No bugs.</p>
        ) : (
          <ul aria-label="Bugs" className="m-0 flex list-none flex-col p-0">
            {bugs.map((bug) => (
              <li key={bug.slug}>
                <button
                  type="button"
                  aria-current={isSelected("bug", bug.slug) || undefined}
                  onClick={() => onSelect({ kind: "bug", id: bug.slug })}
                  className={cn(ROW, isSelected("bug", bug.slug) && CURRENT)}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {bug.title}
                  </span>
                  {bug.jira !== undefined && (
                    <Tag size="sm" mono>
                      {bug.jira}
                    </Tag>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
