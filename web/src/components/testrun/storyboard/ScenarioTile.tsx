import { fileIsUpdated, effectiveVerdict, type Verdict } from "@review-dash/shared";
import { CheckIcon, ListChecks, MessageSquareIcon, XIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { Tag } from "@/components/ui/tag";
import { runFileUrl } from "@/lib/paths";
import { SCENARIO_STATUS_LABEL, SCENARIO_STATUS_TONE } from "@/lib/scenario-status";
import { cn } from "@/lib/utils";
import { VERDICT_STYLE, verdictKind } from "@/lib/verdict";
import { useReview } from "@/state/review-context";
import { scenarioAccentClass } from "./scenario-accent";
import type { Scenario } from "./scenario-types";

export interface ScenarioTileProps {
  sessionId: string;
  scenario: Scenario;
  current: boolean;
  /** Open comments on the scenario. */
  openComments: number;
  onOpen: () => void;
  onApprove: () => void;
}

/** The verdict is an outlined corner stamp on an otherwise neutral tile, like the file tile's. */
const VERDICT_STAMP: Record<Exclude<Verdict, "none">, string> = {
  approved: "border-ok-bd text-green",
  rejected: "border-err-bd text-red",
};

function count(n: number, noun: string): string | null {
  return n === 0 ? null : `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * A compact card for the grid, the counterpart of the file tile: a band in the status accent, the first screenshot,
 * the title, the status chip, the review state and the evidence counts. `A` approves a focused tile; Enter opens it.
 */
export function ScenarioTile({ sessionId, scenario, current, openComments, onOpen, onApprove }: ScenarioTileProps) {
  const { fileReview } = useReview();
  const item = { path: scenario.id, fingerprint: scenario.fingerprint };
  const review = fileReview(scenario.id);
  const verdict = effectiveVerdict(review, item);
  const updated = fileIsUpdated(review, item);
  const kind = verdictKind(verdict, openComments);
  const style = VERDICT_STYLE[kind];
  const Icon = style.icon;
  const stamp = verdict === "none" ? null : VERDICT_STAMP[verdict];
  const { videos, screenshots, data } = scenario.evidence;
  const shot = screenshots[0];
  const counts = [count(videos.length, "video"), count(screenshots.length, "screenshot"), count(data.length, "data file")].filter(
    (part) => part !== null,
  );

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if ((event.key === "a" || event.key === "A") && verdict !== "approved") {
      event.preventDefault();
      onApprove();
    }
  }

  return (
    <li
      data-scenario={scenario.id}
      data-verdict={verdict}
      data-current={current || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        scenarioAccentClass(scenario.status),
        "group relative rounded-xl border-fine border-line bg-surface text-ink transition-colors hover:bg-paper-2",
        // Paint containment would clip a ring on the inner button, so the tile itself shows keyboard focus.
        "[contain-intrinsic-size:auto_168px] [content-visibility:auto]",
        "has-[>button:focus-visible]:outline-[3px] has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-focus",
        current && "border-ink ring-2 ring-ink",
      )}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[7px] rounded-t-[10px] border-b-fine border-fill-line bg-ft" />
      {stamp && (
        <span aria-hidden data-verdict-overlay={verdict} className="pointer-events-none absolute top-2.5 right-2 z-10">
          <span className={cn("inline-flex size-[26px] items-center justify-center rounded-full border-[2px] bg-surface", stamp)}>
            {verdict === "approved" ? <CheckIcon className="size-[13px] stroke-[3]" /> : <XIcon className="size-[13px] stroke-[3]" />}
          </span>
        </span>
      )}
      <button
        type="button"
        aria-label={scenario.title}
        aria-current={current || undefined}
        title={scenario.title}
        onClick={onOpen}
        className="flex w-full flex-col gap-[9px] rounded-[inherit] px-3.5 pt-5 pb-[13px] text-left focus-visible:outline-none"
      >
        <span className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border-fine border-line bg-sunken text-ink-muted">
          {shot !== undefined ? (
            <img src={runFileUrl(sessionId, shot.path)} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <ListChecks aria-hidden className="size-7" />
          )}
        </span>
        <span className="truncate pr-[30px] text-sm leading-[19px] font-bold">{scenario.title}</span>
        <span className="flex w-full items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <StatusDot tone={SCENARIO_STATUS_TONE[scenario.status]} label="" className="border-fine border-fill-line" />
            {SCENARIO_STATUS_LABEL[scenario.status]}
          </span>
          <span className="ml-auto text-ink-muted">{counts.length > 0 ? counts.join(" · ") : "No evidence"}</span>
        </span>
        <span className="flex min-h-[22px] w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-ink-muted">
          {kind === "none" ? (
            <span className={cn(review?.viewed && "text-ink")}>{review?.viewed ? "Viewed" : "Unreviewed"}</span>
          ) : (
            <span data-verdict={kind} className={cn("inline-flex items-center gap-[5px] font-bold", style.className)}>
              <Icon aria-hidden className={cn("size-[13px] stroke-[3]", style.iconClassName)} />
              {kind === "approved" ? "Approved" : kind === "rejected" ? "Rejected" : "Commented"}
            </span>
          )}
          {openComments > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title={`${openComments} open ${openComments === 1 ? "comment" : "comments"}`}>
              <MessageSquareIcon aria-hidden className="size-3" /> {openComments}
            </span>
          )}
          {updated && (
            <Tag size="sm" tone="warn" title="Changed on disk since you reviewed it" className="ml-auto">
              Updated
            </Tag>
          )}
        </span>
      </button>
      {verdict !== "approved" && (
        <Button
          size="icon-sm"
          aria-label={`Approve ${scenario.title}`}
          title="Approve (A)"
          onClick={onApprove}
          className={cn(
            "absolute top-2.5 right-2 z-20 size-[26px] rounded-full border-ok-bd/60 bg-surface text-green shadow-none",
            "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-mint hover:text-hdr-ink focus-visible:opacity-100",
            '[&_svg:not([class*="size-"])]:size-[13px] [&_svg]:stroke-[3]',
          )}
        >
          <CheckIcon aria-hidden />
        </Button>
      )}
    </li>
  );
}
