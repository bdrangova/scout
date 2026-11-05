import type { PrReviewStatus } from '@scout/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { setPrReviewStatus } from '@/lib/github'
import { PR_STATUS_SPEC } from '@/lib/pr-status'
import { describeApiError } from '@/lib/runs'

/** Sets a PR review session's status with a toast; `onApproved` runs after Approved closed the session. */
export function useSetPrReviewStatus(id: string, onApproved?: () => void): { busy: boolean; set: (status: PrReviewStatus) => Promise<void> } {
  const [busy, setBusy] = useState(false)
  async function set(status: PrReviewStatus) {
    setBusy(true)
    try {
      await setPrReviewStatus(id, status)
      toast.success(status === 'approved' ? 'Approved: the review is closed' : `Marked ${PR_STATUS_SPEC[status].label.toLowerCase()}`)
      if (status === 'approved') onApproved?.()
    } catch (err) {
      toast.error("Couldn't set the review status", { description: describeApiError(err) })
    } finally {
      setBusy(false)
    }
  }
  return { busy, set }
}
