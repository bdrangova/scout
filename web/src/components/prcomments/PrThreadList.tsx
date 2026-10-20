import type { PrThread } from '@/lib/pr-threads'
import { cn } from '@/lib/utils'
import { PrCommentCard } from './PrCommentCard'

/** A list of GitHub threads; `label` names it for screen readers. */
export function PrThreadList({ threads, label, showLocation, className }: { threads: readonly PrThread[]; label: string; showLocation?: boolean; className?: string }) {
  if (threads.length === 0) return null
  return (
    <ul aria-label={label} className={cn('flex flex-col gap-2', className)}>
      {threads.map((thread) => (
        <PrCommentCard key={thread.root.id} thread={thread} showLocation={showLocation} />
      ))}
    </ul>
  )
}
