import { formatAdditions, formatDeletions, formatFileCount } from '@/lib/format'
import { cn } from '@/lib/utils'

interface DiffStatsProps {
  additions: number
  deletions: number
  /** When given, ` · n files` follows the counts. */
  files?: number
  className?: string
}

/** `+272 −51 · 8 files` with the mock's green/red accents. */
export function DiffStats({ additions, deletions, files, className }: DiffStatsProps) {
  return (
    <span className={cn('inline-flex items-baseline gap-2 text-[13px] tabular-nums whitespace-nowrap', className)}>
      <span className="font-semibold text-approve">{formatAdditions(additions)}</span>
      <span className="font-semibold text-reject">{formatDeletions(deletions)}</span>
      {files !== undefined && <span className="text-muted-foreground">· {formatFileCount(files)}</span>}
    </span>
  )
}
