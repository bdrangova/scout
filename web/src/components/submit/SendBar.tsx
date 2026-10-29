import { SendIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { SEND_TARGET_LABELS } from '@/lib/runs'
import type { SaveStatus } from '@/state/review-context'
import type { SendReviewState } from '@/state/useSendReview'
import { SendTargetMenu } from './SendTargetMenu'
import { UnsavedDraftsNotice } from './UnsavedDraftsNotice'

export interface SendBarProps {
  send: Pick<SendReviewState, 'target' | 'setTarget' | 'canContinue' | 'sending' | 'sendError' | 'sendBlocker' | 'sendSummary' | 'send'>
  saveStatus: SaveStatus
}

/** The sticky bar at the bottom of Submit: save and send errors, the blocker and the split Submit button. */
export function SendBar({ send, saveStatus }: SendBarProps) {
  const { target, setTarget, canContinue, sending, sendError, sendBlocker, sendSummary } = send
  const disabled = sendBlocker !== null || sending
  const label = sending ? 'Sending…' : `Submit to ${SEND_TARGET_LABELS[target].toLowerCase()}`
  return (
    <div className="sticky bottom-0 z-10 flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-t-fine border-line bg-paper-2 px-6 py-3">
      <UnsavedDraftsNotice />
      {sendError && (
        <Notice tone="err" className="max-w-full [&>span:last-child]:truncate">
          {sendError}
        </Notice>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {saveStatus === 'saving' && (
          <span className="text-xs font-medium text-ink-muted" aria-live="polite">
            Saving…
          </span>
        )}
        {saveStatus === 'error' && (
          <Notice tone="warn" role="status" className="min-h-7 text-xs">
            Draft not saved
          </Notice>
        )}
        {sendBlocker && !sending && <span className="text-xs font-medium text-ink-muted">{sendBlocker}</span>}
        {!sendBlocker && sendSummary && (
          <span className="text-xs font-semibold text-ink" data-testid="send-summary">
            {sendSummary}
          </span>
        )}
        <div className="flex" role="group" aria-label="Send" data-slot="button-group">
          <Button
            variant="primary"
            className="rounded-r-none"
            onClick={() => void send.send()}
            disabled={disabled}
            aria-busy={sending}
            aria-label={label}
            title={label}
          >
            <SendIcon aria-hidden />
            {label}
          </Button>
          <SendTargetMenu value={target} onChange={setTarget} canContinue={canContinue} disabled={disabled} />
        </div>
      </div>
    </div>
  )
}
