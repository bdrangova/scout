import { GitPullRequest } from 'lucide-react'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'

interface PrFileFilterProps {
  total: number
  threadCount: number
  active: boolean
  onChange: (active: boolean) => void
}

/** "All files n | GitHub comments m": narrows the tree to the files with PR threads. */
export function PrFileFilter({ total, threadCount, active, onChange }: PrFileFilterProps) {
  return (
    <Segmented aria-label="Show files" variant="pills" className="shrink-0 pb-2">
      <SegmentedItem pressed={!active} count={total} onClick={() => onChange(false)} className="h-7 px-3 text-[12.5px]">
        All files
      </SegmentedItem>
      <SegmentedItem pressed={active} count={threadCount} onClick={() => onChange(true)} className="h-7 px-3 text-[12.5px]" title="Only files with GitHub PR comments">
        <GitPullRequest aria-hidden />
        GitHub comments
      </SegmentedItem>
    </Segmented>
  )
}
