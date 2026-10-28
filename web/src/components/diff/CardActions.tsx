import type { Verdict } from '@scout/shared'
import { Check, MessageSquare, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

export interface CardActionsProps {
  verdict: Verdict
  pendingReject: boolean
  /** The verdict controls are live (the file has a net change in the full diff). */
  reviewable: boolean
  /** Something is typed in the comment box: it goes out with the verdict. */
  hasDraft: boolean
  onApprove: () => void
  onReject: () => void
  onComment: () => void
}

const HINTS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: 'A', icon: Check, label: 'approve' },
  { key: 'X', icon: X, label: 'reject' },
  { key: 'C', icon: MessageSquare, label: 'comment' },
]

/** The icon-only square grows into a labelled button from `lg`. */
const LABELLED = 'lg:w-auto lg:px-3.5'

/** "Reject X": the word and its key cap, shown from `lg` (the button's aria-label carries the name below that). */
function KeyLabel({ text, hint }: { text: string; hint: string }) {
  return (
    <span aria-hidden className="hidden items-center gap-1.5 lg:inline-flex">
      {text}
      <Kbd>{hint}</Kbd>
    </span>
  )
}

/** The card footer: the key hints, then the raised Reject and Comment squares and the Approve button. */
export function CardActions({ verdict, pendingReject, reviewable, hasDraft, onApprove, onReject, onComment }: CardActionsProps) {
  const rejecting = verdict === 'rejected' || pendingReject
  const approved = verdict === 'approved'
  return (
    <div data-slot="card-actions" className="flex flex-wrap items-center gap-3">
      {hasDraft ? (
        <span className="flex-1 text-xs font-semibold text-ink-muted">Sent with the verdict.</span>
      ) : (
        <span className="hidden flex-1 items-center gap-3.5 text-xs font-semibold text-ink-muted sm:flex lg:hidden" aria-hidden>
          {HINTS.map(({ key, icon: Icon, label }) => (
            <span key={key} className="inline-flex items-center gap-1.5" title={`${key}: ${label}`}>
              <Kbd>{key}</Kbd>
              <Icon className="size-[13px]" />
            </span>
          ))}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="reject"
          size="icon"
          aria-label="Reject"
          title="Reject (X)"
          disabled={!reviewable}
          aria-pressed={rejecting}
          onClick={onReject}
          className={cn(LABELLED, rejecting && 'bg-red-solid text-on-red')}
        >
          <X aria-hidden />
          <KeyLabel text="Reject" hint="X" />
        </Button>
        <Button size="icon" aria-label="Comment" title="Comment (C)" disabled={!reviewable} onClick={onComment} className={LABELLED}>
          <MessageSquare aria-hidden />
          <KeyLabel text="Comment" hint="C" />
        </Button>
        <Button
          variant={approved ? 'approve' : 'primary'}
          disabled={!reviewable}
          aria-pressed={approved}
          aria-label="Approve"
          title="Approve (A)"
          onClick={onApprove}
        >
          <Check aria-hidden />
          Approve
          <span aria-hidden className="hidden lg:inline-flex">
            <Kbd>A</Kbd>
          </span>
        </Button>
      </div>
    </div>
  )
}
