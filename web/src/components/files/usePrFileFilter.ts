import type { TreeFile } from '@scout/shared'
import { useMemo, useState } from 'react'
import { usePrComments } from '@/state/pr-comments-context'

export interface PrFileFilter {
  /** Threads on the listed files; the rail offers the filter only when this is above zero. */
  threadCount: number
  /** The filter is on (and there is something to filter by). */
  active: boolean
  setActive: (active: boolean) => void
  /** `files` narrowed to those with GitHub threads while the filter is on. */
  files: readonly TreeFile[]
}

/** The rail's "GitHub comments" filter: files that carry PR threads. */
export function usePrFileFilter(files: readonly TreeFile[]): PrFileFilter {
  const { fileCounts } = usePrComments()
  const [on, setActive] = useState(false)
  const threadCount = useMemo(() => files.reduce((sum, file) => sum + (fileCounts.get(file.path)?.total ?? 0), 0), [files, fileCounts])
  const active = on && threadCount > 0
  const narrowed = useMemo(() => (active ? files.filter((file) => fileCounts.has(file.path)) : files), [active, files, fileCounts])
  return { threadCount, active, setActive, files: narrowed }
}
