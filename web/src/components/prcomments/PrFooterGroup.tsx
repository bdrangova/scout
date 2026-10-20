import { Eyebrow } from '@/components/common/Eyebrow'
import type { PrThread } from '@/lib/pr-threads'
import { PrThreadList } from './PrThreadList'

/** The card footer's "PR comments" group: GitHub threads that have no line in the diff shown (outdated, file-level, or a line the diff does not reach). */
export function PrFooterGroup({ threads, path }: { threads: readonly PrThread[]; path: string }) {
  if (threads.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5" data-pr-footer>
      <Eyebrow>PR comments</Eyebrow>
      <PrThreadList threads={threads} label={`GitHub comments on ${path} outside the diff lines`} showLocation />
    </div>
  )
}
