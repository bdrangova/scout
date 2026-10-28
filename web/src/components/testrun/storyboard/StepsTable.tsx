import type { Step } from "@scout/shared";

const COLUMNS = [
  { key: "label", title: "Step" },
  { key: "action", title: "Action" },
  { key: "expected", title: "Expected" },
  { key: "observed", title: "Observed" },
  { key: "result", title: "Result" },
] as const;

/** The scenario's structured steps; a column shows only when some step fills it. */
export function StepsTable({ steps }: { steps: readonly Step[] }) {
  const columns = COLUMNS.filter((column) =>
    steps.some((step) => step[column.key] !== undefined),
  );
  if (columns.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table
        aria-label="Steps"
        className="w-full border-collapse text-left text-[13px]"
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="border-b-fine border-line px-2 py-1.5 text-xs font-bold text-ink-muted"
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((step, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="border-b-fine border-line/60 px-2 py-1.5 align-top"
                >
                  {step[column.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
