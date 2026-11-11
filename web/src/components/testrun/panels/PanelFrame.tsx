import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelTitle,
} from "@/components/ui/panel";
import { cn } from "@/lib/utils";

export interface PanelFrameProps {
  title?: string;
  /** 2 spans both columns of the grid from `md`. */
  span?: 1 | 2;
  type: string;
  children: ReactNode;
}

/** The header name of a panel the index left untitled: `key-value` → `Key value`. */
function fallbackTitle(type: string): string {
  if (type === "unsupported") return "Unsupported panel";
  const words = type.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The card around one overview panel: a title strip whose chevron (or title) folds the body away, the body, and the grid span. */
export function PanelFrame({
  title,
  span = 1,
  type,
  children,
}: PanelFrameProps) {
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();
  const name = title ?? fallbackTitle(type);
  const toggle = () => setExpanded((value) => !value);
  return (
    <Panel
      data-panel={type}
      aria-label={title ?? `${type} panel`}
      className={cn(span === 2 && "md:col-span-2", !expanded && "self-start")}
    >
      <PanelHeader className="px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-1.5 size-7 rounded-md"
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
          title={expanded ? "Collapse" : "Expand"}
          onClick={toggle}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-[15px] transition-transform",
              !expanded && "-rotate-90",
            )}
          />
        </Button>
        <PanelTitle className="min-w-0 break-words">
          <button
            type="button"
            tabIndex={-1}
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={toggle}
            className={cn(
              "cursor-pointer rounded-sm text-left",
              title === undefined && "text-ink-muted",
            )}
          >
            {name}
          </button>
        </PanelTitle>
      </PanelHeader>
      <div id={bodyId} hidden={!expanded} className="flex min-w-0 flex-col">
        <PanelBody className="flex flex-col gap-3">{children}</PanelBody>
      </div>
    </Panel>
  );
}
