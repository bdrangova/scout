import { ScoutMark } from '@/components/brand/Scout';
import { ArrowLeftIcon, SendIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { testRunRoute } from "@/lib/paths";

export interface ScenarioCompleteProps {
  sessionId: string;
  /** Leave the end state and return to the current scenario. */
  onBack: () => void;
  /** The current view (cards or grid), kept behind the panel, blurred and inert. */
  children: ReactNode;
}

/**
 * The end of the scenario review, the counterpart of the file review's `ReviewComplete`: the view stays on screen but
 * blurred and out of reach (inert, hidden from assistive tech), under a centered panel that leads to Submit.
 */
export function ScenarioComplete({ sessionId, onBack, children }: ScenarioCompleteProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-paper" data-review-complete>
      <div inert aria-hidden className="pointer-events-none flex min-h-0 flex-1 scale-[1.02] flex-col blur-[7px] select-none">
        {children}
      </div>
      <div aria-hidden className="absolute inset-0 bg-sunken/55" />
      <section aria-labelledby="review-complete-title" className="absolute inset-0 flex items-center justify-center p-6">
        <Panel className="w-full max-w-[460px]">
          <PanelHeader className="min-h-[52px] justify-center">
            <PanelTitle id="review-complete-title" className="text-lg">
              Review complete
            </PanelTitle>
          </PanelHeader>
          <PanelBody className="flex flex-col items-center gap-5 px-7 pt-[26px] pb-[22px]">
            <ScoutMark className="size-24" />
            <Notice tone="ok" data-status="ready">
              Every scenario has a verdict
            </Notice>
            <Link to={testRunRoute(sessionId, "submit")} className={buttonVariants({ variant: "primary" })}>
              <SendIcon aria-hidden />
              Submit
            </Link>
            <Button variant="ghost" size="icon-sm" aria-label="Back to scenarios" title="Back to scenarios" onClick={onBack} className="text-ink-muted shadow-none hover:text-ink">
              <ArrowLeftIcon aria-hidden />
            </Button>
          </PanelBody>
        </Panel>
      </section>
    </div>
  );
}
