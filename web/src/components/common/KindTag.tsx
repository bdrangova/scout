import type { LucideIcon } from 'lucide-react'
import { Tag, type TagProps } from '@/components/ui/tag'

export interface KindTagProps extends Omit<TagProps, 'icon' | 'children'> {
  icon: LucideIcon
  /** `Jira ticket`, `Markdown`, `Image`: the accessible name and the tooltip. */
  label: string
}

/** The icon-only `Tag` that names an item's kind in a card header or a thumbnail. */
export function KindTag({ icon: Icon, label, ...props }: KindTagProps) {
  return (
    <Tag icon aria-label={label} title={label} {...props}>
      <Icon aria-hidden />
    </Tag>
  )
}
