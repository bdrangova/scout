import type { ReactNode } from "react";
import { RailSection } from "@/components/layout/RailSlot";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface RunRailSectionProps {
  /** The list's name: `Scenarios`, `Logs`. */
  heading: string;
  count?: number;
  /** Items listed while a filter narrows the list: reads `shown of count`. */
  shown?: number;
  /** Filters and pickers of the page (Find, Failures); they live here, not in the page header. */
  picker?: ReactNode;
  /** A control at the right of the heading (the "only commented" toggle). */
  action?: ReactNode;
  /** The list. */
  children: ReactNode;
}

/**
 * A test-run page's block in the session rail: its heading, pickers, and scrolling list.
 * The Swipe | Grid toggle lives in the shared session header.
 */
export function RunRailSection({ heading, count, shown, picker, action, children }: RunRailSectionProps) {
  return (
    <RailSection>
      <TooltipProvider delay={150}>
        <div data-slot="run-rail" className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-2.5 border-b-fine border-line px-3.5 py-3">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[13px] font-bold">{heading}</h2>
              {count !== undefined && (
                <span className="text-xs font-semibold text-ink-muted tabular-nums">{shown === undefined ? count : `${shown} of ${count}`}</span>
              )}
              {action && <span className="ml-auto">{action}</span>}
            </div>
            {picker}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2.5 py-2.5">{children}</div>
        </div>
      </TooltipProvider>
    </RailSection>
  );
}
