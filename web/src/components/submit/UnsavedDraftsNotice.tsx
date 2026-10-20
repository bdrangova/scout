import { Link } from 'react-router'
import { Notice } from '@/components/ui/notice'
import { pluralize } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUnsavedDraftLinks } from './useUnsavedDraftLinks'

/**
 * A warning (never a block) that comment text was typed and not added, so a send would leave it
 * out, with a link to each composer. Nothing is added for the reviewer.
 */
export function UnsavedDraftsNotice({ className }: { className?: string }) {
  const links = useUnsavedDraftLinks()
  if (links.length === 0) return null
  return (
    <Notice tone="warn" role="status" data-testid="unsaved-drafts" className={cn('h-auto max-w-full flex-wrap py-1 text-xs', className)}>
      <span>{pluralize(links.length, 'comment')} typed but not added:</span>
      <span className="flex flex-wrap gap-x-2.5">
        {links.map((link) => (
          <Link key={link.key} to={link.to} relative="path" className="max-w-[28ch] truncate font-mono font-bold underline underline-offset-2">
            {link.label}
          </Link>
        ))}
      </span>
    </Notice>
  )
}
