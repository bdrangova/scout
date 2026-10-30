import type { ExtraItem } from '@scout/shared'
import { useCommentedOnlyFilter, useOpenCommentRefs } from '@/components/layout/commented-only'
import { CommentedOnlyToggle } from '@/components/layout/CommentedOnlyToggle'
import { RailSection } from '@/components/layout/RailSlot'
import { EXTRA_KIND } from '@/components/spec/item-kinds'
import { RailBlock, RailItem } from '@/components/spec/RailItem'
import { scrollToTarget } from '@/components/spec/rail-targets'
import { useActiveTarget } from '@/components/spec/useActiveTarget'
import { splitPath } from '@/lib/paths'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'

function ExtraRow({ item, current, onSelect }: { item: ExtraItem; current: boolean; onSelect: (path: string) => void }) {
  const comments = useOpenCommentCount('extra', item.path)
  return (
    <RailItem
      icon={EXTRA_KIND[item.type].icon}
      title={item.title}
      subtitle={splitPath(item.path).name}
      mono
      twoLines
      current={current}
      comments={comments}
      onSelect={() => {
        onSelect(item.path)
        scrollToTarget(item.path)
      }}
    />
  )
}

/** The Extras page's block in the session rail: the list of extras, in page order; a click scrolls to its card. */
export function ExtrasRailSection({ extras }: { extras: readonly ExtraItem[] }) {
  const [active, select] = useActiveTarget(extras.map((item) => item.path))
  const current = active ?? extras[0]?.path ?? null
  const openRefs = useOpenCommentRefs('extra')
  const commented = useCommentedOnlyFilter(extras, (item) => openRefs.has(item.path))
  return (
    <RailSection>
      <RailBlock
        title="Extras"
        count={extras.length}
        shown={commented.active ? commented.items.length : undefined}
        action={<CommentedOnlyToggle size="sm" count={commented.count} active={commented.active} onToggle={commented.toggle} />}
      >
        {commented.items.map((item) => (
          <ExtraRow key={item.path} item={item} current={item.path === current} onSelect={select} />
        ))}
      </RailBlock>
    </RailSection>
  )
}
