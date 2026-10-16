import type { CommentTarget, SpecItem } from '@review-dash/shared'
import { useMemo, type ReactNode } from 'react'
import { TargetComments } from '@/components/common/TargetComments'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ContentState } from '@/lib/useContent'
import { cn } from '@/lib/utils'

export interface SpecCardShellProps {
  /** `Jira`, `Markdown`, `Artifact`. */
  kind: string
  item: SpecItem
  title: ReactNode
  /** Chips and links after the title. */
  actions?: ReactNode
  content: ContentState
  children: (text: string) => ReactNode
  className?: string
}

/**
 * Header row (chip, title, actions), the loading / error states shared by the spec cards, and the
 * comments on the item (`{ kind: 'spec', ref: item.path }`).
 */
export function SpecCardShell({ kind, item, title, actions, content, children, className }: SpecCardShellProps) {
  const target = useMemo<CommentTarget>(() => ({ kind: 'spec', ref: item.path }), [item.path])
  return (
    <article aria-label={`${kind} spec`} className={cn('flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm', className)}>
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{kind}</Badge>
        <h3 className="min-w-0 text-[15px] font-semibold">{title}</h3>
        <span className="ml-auto flex flex-wrap items-center gap-2">{actions}</span>
      </header>
      {content.error ? (
        <div className="flex flex-col items-start gap-2 text-sm text-reject">
          <p>Couldn't load this file: {content.error.message}</p>
          <Button variant="outline" size="xs" onClick={content.reload}>
            Retry
          </Button>
        </div>
      ) : content.content === null ? (
        <p className="text-sm text-muted-foreground" aria-busy="true">
          Loading…
        </p>
      ) : (
        children(content.content)
      )}
      <TargetComments target={target} label={`Comment on ${item.title}`} className="flex flex-col gap-3 border-t pt-4" />
    </article>
  )
}
