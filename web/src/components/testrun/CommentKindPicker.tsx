import type { CommentKind } from "@review-dash/shared";
import { cn } from "@/lib/utils";

/** What the three comment kinds say to the agent that re-runs the scenario. */
const COMMENT_KIND_LABEL: Record<CommentKind, string> = {
  "not-clear": "Not clear",
  incorrect: "Incorrect",
  "expected-behaviour": "Expected behaviour",
};

const KINDS = Object.keys(COMMENT_KIND_LABEL) as CommentKind[];

export interface CommentKindPickerProps {
  value: CommentKind | null;
  onChange: (next: CommentKind | null) => void;
  className?: string;
}

/** Three toggle chips (not clear, incorrect, expected behaviour); picking the pressed one again clears the kind. */
export function CommentKindPicker({
  value,
  onChange,
  className,
}: CommentKindPickerProps) {
  return (
    <div
      role="group"
      aria-label="Comment kind"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <span className="text-xs font-semibold text-ink-muted">
        This comment is
      </span>
      {KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          onClick={() => onChange(value === kind ? null : kind)}
          className={cn(
            "inline-flex h-6 items-center rounded-full border-fine border-line bg-paper px-2.5 text-[11.5px] font-bold transition-colors hover:bg-hover",
            value === kind && "border-ink bg-yellow text-on-yellow",
          )}
        >
          {COMMENT_KIND_LABEL[kind]}
        </button>
      ))}
    </div>
  );
}
