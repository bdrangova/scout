import type { CommentTarget, SpecItem } from '@scout/shared'
import type { LucideIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { ContentCard } from '@/components/common/ContentCard'
import { TargetComments } from '@/components/common/TargetComments'
import type { ContentState } from '@/lib/useContent'

export interface SpecCardShellProps {
  /** `Jira`, `Markdown`, `Artifact`: the article is named `<kind> spec`. */
  kind: string
  icon: LucideIcon
  /** The kind tag's name (`Jira ticket`); defaults to `kind`. */
  kindLabel?: string
  item: SpecItem
  title: ReactNode
  subtitle?: ReactNode
  /** Chips and links after the title. */
  actions?: ReactNode
  content: ContentState
  children: (text: string) => ReactNode
  className?: string
}

/**
 * A spec card: the shared `ContentCard` with the fold chevron, plus the comments on the item
 * (`{ kind: 'spec', ref: item.path }`) in the footer.
 */
export function SpecCardShell({ kind, icon, kindLabel, item, title, subtitle, actions, content, children, className }: SpecCardShellProps) {
  const target = useMemo<CommentTarget>(() => ({ kind: 'spec', ref: item.path }), [item.path])
  return (
    <ContentCard
      label={`${kind} spec`}
      kind={{ icon, label: kindLabel ?? kind }}
      title={title}
      subtitle={subtitle}
      actions={actions}
      collapseLabel={item.title}
      content={content}
      footer={<TargetComments target={target} label={`Comment on ${item.title}`} className="flex flex-col gap-3" />}
      className={className}
    >
      {children}
    </ContentCard>
  )
}
