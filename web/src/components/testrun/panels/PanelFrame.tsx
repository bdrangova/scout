import type { ReactNode } from "react";
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

/** The card around one overview panel: optional title strip, body, and the grid span. */
export function PanelFrame({
  title,
  span = 1,
  type,
  children,
}: PanelFrameProps) {
  return (
    <Panel
      data-panel={type}
      aria-label={title ?? `${type} panel`}
      className={cn(span === 2 && "md:col-span-2")}
    >
      {title !== undefined && (
        <PanelHeader>
          <PanelTitle>{title}</PanelTitle>
        </PanelHeader>
      )}
      <PanelBody className="flex flex-col gap-3">{children}</PanelBody>
    </Panel>
  );
}
