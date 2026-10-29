import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import type { SessionStatus } from '@scout/shared'
import { CircleHelpIcon } from 'lucide-react'
import { STATUS_TONE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'

/** What each session status means and what moves it on, in the order a review moves through them. */
const STATUS_MEANINGS: readonly { status: SessionStatus; meaning: string; next: string }[] = [
  { status: 'unreviewed', meaning: 'Nothing reviewed yet: no verdict and no comment.', next: 'Give a file a verdict or a comment.' },
  { status: 'in-progress', meaning: 'Some files have a verdict or a comment (a comment alone counts as reviewed).', next: 'Review the rest.' },
  { status: 'ready', meaning: 'Every file is reviewed and nothing is sent. Even with every file approved this is not Approved yet.', next: 'Submit a decision.' },
  { status: 'sent', meaning: 'You sent Request changes or Reject to Claude Code and it has not answered or changed anything since. Also shown if Approve was sent but a file is no longer approved.', next: 'Wait for the agent, then re-review.' },
  { status: 'updated', meaning: 'Files changed on disk, or Claude Code replied, after you sent.', next: 'Re-review the changed files, then submit again.' },
  { status: 'approved', meaning: 'You sent an Approve decision and nothing has changed since. The only way to get here.', next: 'Done.' },
]

/** The vocabulary of session statuses as a popover opened from a "?" button. */
export function StatusLegend({ className }: { className?: string }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        aria-label="What do the statuses mean?"
        title="What do the statuses mean?"
        className={cn('inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:text-ink', className)}
      >
        <CircleHelpIcon className="size-4" aria-hidden />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
          <PopoverPrimitive.Popup
            className="z-50 w-[min(400px,calc(100vw-24px))] rounded-xl border-fine border-line bg-surface p-3 text-[13px] text-ink shadow-panel outline-none"
          >
            <PopoverPrimitive.Title className="m-0 mb-2 text-[13px] font-bold">Session statuses</PopoverPrimitive.Title>
            <dl className="m-0 flex flex-col gap-2">
              {STATUS_MEANINGS.map(({ status, meaning, next }) => {
                const spec = STATUS_TONE.session(status)
                const Icon = spec.icon
                return (
                  <div key={status} data-status={status} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-2.5">
                    <Icon className={cn('mt-0.5 size-4 stroke-[2.5]', spec.textClass, spec.pulse && 'animate-pulse motion-reduce:animate-none')} aria-hidden />
                    <dt className={cn('font-bold', spec.textClass)}>{spec.label}</dt>
                    <dd className="col-start-2 m-0 text-ink-muted">
                      {meaning} <span className="font-semibold text-ink">{next}</span>
                    </dd>
                  </div>
                )
              })}
            </dl>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
