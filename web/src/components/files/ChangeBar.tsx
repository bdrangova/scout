import { cn } from '@/lib/utils'

const SQUARES = 5

/** The squares' colours: additions, deletions, then the neutral rest. */
function changeBarSquares(additions: number, deletions: number): ('add' | 'delete' | 'none')[] {
  const total = additions + deletions
  if (total === 0) return Array.from({ length: SQUARES }, () => 'none')
  let green = Math.round((additions / total) * SQUARES)
  let red = SQUARES - green
  // Both kinds of change always get at least one square.
  if (additions > 0 && green === 0) {
    green = 1
    red = SQUARES - 1
  }
  if (deletions > 0 && red === 0) {
    red = 1
    green = SQUARES - 1
  }
  return [
    ...Array.from({ length: green }, (): 'add' => 'add'),
    ...Array.from({ length: red }, (): 'delete' => 'delete'),
  ]
}

/** GitHub's five-square add/delete bar. */
export function ChangeBar({ additions, deletions, className }: { additions: number; deletions: number; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex gap-0.5', className)}>
      {changeBarSquares(additions, deletions).map((kind, index) => (
        <span
          key={index}
          className={cn('block size-[9px] rounded-[2px]', kind === 'add' && 'bg-green', kind === 'delete' && 'bg-red', kind === 'none' && 'bg-line/70')}
        />
      ))}
    </span>
  )
}
