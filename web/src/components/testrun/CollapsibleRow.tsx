import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CollapsibleRowProps {
  title: string;
  /** Muted text after the title: a count or a one-line digest. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

/** A disclosure row: the title is a toggle button (`aria-expanded`), the body mounts only while open. */
export function CollapsibleRow({
  title,
  summary,
  defaultOpen = false,
  className,
  children,
}: CollapsibleRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section
      data-slot="collapsible-row"
      className={cn("border-t-fine border-line", className)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 py-2.5 text-left text-[13px] font-bold text-ink hover:text-ink-muted"
      >
        <Chevron aria-hidden className="size-4 shrink-0" />
        {title}
        {summary !== undefined && (
          <span className="text-xs font-semibold text-ink-muted">
            {summary}
          </span>
        )}
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col gap-3 pb-3.5 pl-6">
          {children}
        </div>
      )}
    </section>
  );
}
