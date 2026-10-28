import type { Verdict } from '@scout/shared'
import { cn } from '@/lib/utils'

interface VerdictOverlayProps {
  verdict: Verdict
  /** The file has at least one open comment (grey tint when there is no verdict). */
  commented: boolean
  /** A reject is waiting for its comment. */
  pendingReject: boolean
}

interface Stamp {
  tint: string
  label: string
  className: string
}

const STAMPS = {
  pending: { tint: 'bg-err-bg/50', label: 'Rejecting · add a comment', className: 'bg-red-solid text-on-red' },
  approved: { tint: 'bg-ok-bg/40', label: 'Approved', className: 'bg-green text-paper' },
  rejected: { tint: 'bg-err-bg/40', label: 'Rejected', className: 'bg-red-solid text-on-red' },
  commented: { tint: 'bg-hover', label: 'Commented', className: 'bg-ink text-paper' },
} satisfies Record<string, Stamp>

/** A tinted wash over the whole card plus a rubber stamp in the corner; never captures pointer events. */
export function VerdictOverlay({ verdict, commented, pendingReject }: VerdictOverlayProps) {
  const kind = pendingReject ? 'pending' : verdict === 'none' ? (commented ? 'commented' : null) : verdict
  if (kind === null) return null
  const stamp = STAMPS[kind]

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-10 transition-colors', stamp.tint)} data-verdict-overlay={kind} aria-hidden>
      <span
        className={cn(
          'absolute top-[76px] right-5 -rotate-6 rounded-md border-fine border-fill-line px-3 py-1 text-xs font-bold tracking-wide uppercase shadow-raised',
          stamp.className,
        )}
      >
        {stamp.label}
      </span>
    </div>
  )
}
