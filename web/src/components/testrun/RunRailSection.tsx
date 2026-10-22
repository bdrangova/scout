import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { ModeToggle } from "@/components/layout/ModeToggle";
import { RailSection } from "@/components/layout/RailSlot";
import { TooltipProvider } from "@/components/ui/tooltip";

export interface RunRailSectionProps {
  /** The list's name: `Scenarios`, `Logs`. */
  heading: string;
  count?: number;
  /** Filters and pickers of the page (Find, Failures); they live here, not in the page header. */
  picker?: ReactNode;
  /** Show the Swipe | Grid toggle in the heading. Off where the page's toggle is in the session bar (Review). */
  modeToggle?: boolean;
  /** The list. */
  children: ReactNode;
}

/**
 * A test-run page's block in the session rail, like the Files page's tree: the heading with the Swipe | Grid
 * toggle (not on Review, where it is in the session bar), the page's pickers, then the scrolling list that selects the current card.
 */
export function RunRailSection({ heading, count, picker, modeToggle = true, children }: RunRailSectionProps) {
  const { pathname } = useLocation();
  return (
    <RailSection>
      <TooltipProvider delay={150}>
        <div data-slot="run-rail" className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-2.5 border-b-fine border-line px-3.5 py-3">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[13px] font-bold">{heading}</h2>
              {count !== undefined && (
                <span className="text-xs font-semibold text-ink-muted tabular-nums">{count}</span>
              )}
              {modeToggle && (
                <span className="ml-auto">
                  <ModeToggle pathname={pathname} />
                </span>
              )}
            </div>
            {picker}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2.5 py-2.5">{children}</div>
        </div>
      </TooltipProvider>
    </RailSection>
  );
}
