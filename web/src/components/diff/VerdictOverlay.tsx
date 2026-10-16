import type { Verdict } from '@review-dash/shared'
import { cn } from '@/lib/utils'

interface VerdictOverlayProps {
  verdict: Verdict
  /** The file has at least one open comment (grey tint when there is no verdict). */
  commented: boolean
  /** A reject is waiting for its comment. */
  pendingReject: boolean
}

/** Green / red / grey tint over the whole card plus a corner badge; never captures pointer events. */
export function VerdictOverlay({ verdict, commented, pendingReject }: VerdictOverlayProps) {
  let tint: string | null = null
  let badge: string | null = null
  let badgeClass = ''
  if (pendingReject) {
    tint = 'bg-reject/15'
    badge = 'Rejecting · add a comment'
    badgeClass = 'bg-reject text-white'
  } else if (verdict === 'approved') {
    tint = 'bg-approve/10'
    badge = 'Approved'
    badgeClass = 'bg-approve text-white'
  } else if (verdict === 'rejected') {
    tint = 'bg-reject/10'
    badge = 'Rejected'
    badgeClass = 'bg-reject text-white'
  } else if (commented) {
    tint = 'bg-muted-foreground/10'
    badge = 'Commented'
    badgeClass = 'bg-muted-foreground text-background'
  }
  if (tint === null) return null

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-10 transition-colors', tint)}
      data-verdict-overlay={pendingReject ? 'pending' : verdict === 'none' ? 'commented' : verdict}
      aria-hidden
    >
      <span
        className={cn(
          'absolute top-16 right-5 rounded-full px-3 py-1 text-xs font-semibold shadow-[0_6px_18px_rgba(27,26,23,0.18)]',
          badgeClass,
        )}
      >
        {badge}
      </span>
    </div>
  )
}
