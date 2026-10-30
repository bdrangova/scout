import { useCommentedOnlyFilter, useOpenCommentRefs } from "@/components/layout/commented-only";
import { CommentedOnlyToggle } from "@/components/layout/CommentedOnlyToggle";
import { GapsAndBugsLists, type GapBugSelection } from "./GapsAndBugsLists";
import { RunRailSection } from "./RunRailSection";
import type { Bug, Gap } from "@scout/shared";

export interface GapsRailSectionProps {
  gaps: readonly Gap[];
  bugs: readonly Bug[];
  selected: GapBugSelection | null;
  onSelect: (selection: GapBugSelection) => void;
}

/** The Gaps & bugs page's block in the session rail: the known gaps and the bugs (only the commented bugs while "only commented" is on). */
export function GapsRailSection(props: GapsRailSectionProps) {
  const openRefs = useOpenCommentRefs("bug");
  // Only bugs take comments: the gaps step aside while the filter is on.
  const commented = useCommentedOnlyFilter(props.bugs, (bug) =>
    openRefs.has(bug.slug),
  );
  const total = props.gaps.length + props.bugs.length;
  return (
    <RunRailSection
      heading="Gaps & bugs"
      count={total}
      shown={commented.active ? commented.items.length : undefined}
      action={
        <CommentedOnlyToggle
          size="sm"
          count={commented.count}
          active={commented.active}
          onToggle={commented.toggle}
        />
      }
    >
      <GapsAndBugsLists
        {...props}
        gaps={commented.active ? [] : props.gaps}
        bugs={commented.items}
      />
    </RunRailSection>
  );
}
