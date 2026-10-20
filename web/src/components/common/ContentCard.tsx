import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelTitle } from '@/components/ui/panel'
import type { ContentState } from '@/lib/useContent'
import { cn } from '@/lib/utils'
import { AsyncBoundary } from './AsyncBoundary'
import { KindTag } from './KindTag'

export interface ContentCardProps {
  /** Accessible name of the card: `Jira spec`, `Architecture`. */
  label: string
  /** The icon tag that names the kind of item (`Markdown`, `Artifact`). */
  kind: { icon: LucideIcon; label: string }
  title: ReactNode
  /** Muted text after the title. */
  subtitle?: ReactNode
  /** Pushed to the right of the header: links, chips, icon buttons. */
  actions?: ReactNode
  /** When set, a chevron folds the body and footer away: `Collapse <label>` / `Expand <label>`. */
  collapseLabel?: string
  /** The fetched file; the body shows the loading / error states until it settles. */
  content?: ContentState
  /** The body, or a renderer of the loaded text when `content` is given. */
  children: ReactNode | ((text: string) => ReactNode)
  /** Below the body: the item's comments. */
  footer?: ReactNode
  bodyClassName?: string
  className?: string
}

/**
 * One card of the Spec and Extras pages: a `Panel` with a tinted header (optional fold chevron,
 * kind tag, title, actions), a body behind an `AsyncBoundary`, and a footer. Cards start open;
 * the fold state lives with the card.
 */
export function ContentCard({ label, kind, title, subtitle, actions, collapseLabel, content, children, footer, bodyClassName, className }: ContentCardProps) {
  const [expanded, setExpanded] = useState(true)
  const bodyId = useId()
  const body = typeof children === 'function' ? (content?.content !== null && content?.content !== undefined ? children(content.content) : null) : children

  return (
    <Panel role="article" aria-label={label} className={className}>
      <PanelHeader className="px-4">
        {collapseLabel !== undefined && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-1.5 size-7 rounded-md"
            aria-expanded={expanded}
            aria-controls={bodyId}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${collapseLabel}`}
            title={expanded ? 'Collapse' : 'Expand'}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown aria-hidden className={cn('size-[15px] transition-transform', !expanded && '-rotate-90')} />
          </Button>
        )}
        <KindTag icon={kind.icon} label={kind.label} />
        <PanelTitle className="min-w-0 break-words">{title}</PanelTitle>
        {subtitle && <span className="min-w-0 truncate text-[13px] font-medium text-ink-muted">{subtitle}</span>}
        {actions && <span className="ml-auto flex items-center gap-2.5">{actions}</span>}
      </PanelHeader>
      <div id={bodyId} hidden={!expanded} className="flex min-w-0 flex-col">
        <PanelBody className={cn('flex min-w-0 flex-col', bodyClassName)}>
          {content ? (
            <AsyncBoundary loading={content.loading} error={content.error} onRetry={content.reload}>
              {body}
            </AsyncBoundary>
          ) : (
            body
          )}
        </PanelBody>
        {footer && <PanelFooter className="flex flex-col gap-3">{footer}</PanelFooter>}
      </div>
    </Panel>
  )
}
