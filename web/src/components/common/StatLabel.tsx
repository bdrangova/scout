import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The word beside an icon-only stat ("files", "reviewed"), shown from `lg` up so the icon never
 * stands alone on a desktop screen (U4). Below `lg` the stat keeps its icon and the aria-label/title
 * of the element around it. Usage: `<Files /> 26 <StatLabel>files</StatLabel>`.
 */
export function StatLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('hidden font-semibold lg:inline', className)}>{children}</span>
}
