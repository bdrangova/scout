import { Files } from 'lucide-react'
import { formatAdditions, formatDeletions, formatFileCount } from '@/lib/format'
import { cn } from '@/lib/utils'

interface DiffStatsProps {
  additions: number
  deletions: number
  /** When given, a files icon with the count follows the delta (`8 files` in the tooltip and for screen readers). */
  files?: number
  className?: string
}

/** `+272 −51 ▤ 8`: the design's green/red delta in mono, then the file count. */
export function DiffStats({ additions, deletions, files, className }: DiffStatsProps) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[13px] font-bold tabular-nums whitespace-nowrap', className)}>
      <span className="text-green">{formatAdditions(additions)}</span>
      <span className="text-red">{formatDeletions(deletions)}</span>
      {files !== undefined && (
        <span className="inline-flex items-center gap-1 font-sans font-semibold text-ink-muted" title={formatFileCount(files)} aria-label={formatFileCount(files)}>
          <Files className="size-3.5" aria-hidden />
          {files}
        </span>
      )}
    </span>
  )
}
