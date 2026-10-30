import { sortChangeTags, type ChangeTag } from '@scout/shared'
import { Tag, type TagProps } from '@/components/ui/tag'
import { CHANGE_TAG_LOOK } from '@/lib/change-tags'
import { cn } from '@/lib/utils'

export function ChangeTagChip({ tag, size }: { tag: ChangeTag; size?: TagProps['size'] }) {
  const { label, icon: Icon, tone, hint } = CHANGE_TAG_LOOK[tag]
  return (
    <Tag tone={tone} size={size} title={hint} data-change-tag={tag}>
      <Icon aria-hidden />
      {label}
    </Tag>
  )
}

/** A change's tags in their fixed order (kinds, then areas). */
export function ChangeTags({ tags, size, className }: { tags: readonly ChangeTag[]; size?: TagProps['size']; className?: string }) {
  if (tags.length === 0) return null
  return (
    <ul aria-label="Change type" className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {sortChangeTags(tags).map((tag) => (
        <li key={tag} className="flex">
          <ChangeTagChip tag={tag} size={size} />
        </li>
      ))}
    </ul>
  )
}
