import type { WorktreeSummary } from '@scout/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Notice } from '@/components/ui/notice'
import { deleteWorktree, fetchWorktree } from '@/hooks/useWorktrees'
import { ApiRequestError } from '@/lib/api'
import { archiveErrorMessage, archiveSession } from '@/lib/archive'
import { pluralize } from '@/lib/format'

type Step = 'archive' | 'delete'

/** The words for a refused or failed delete: the server's 409 reasons get a plain sentence. */
function deleteErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError && err.status === 409) {
    const reason = (err.body as { reason?: unknown } | null)?.reason
    if (reason === 'dirty') return "This worktree has uncommitted changes now. Commit or discard them first."
    if (reason === 'sessions') return 'This worktree still has sessions. Archive them first.'
  }
  // 409 `git` (git refused) and 422 (no main repo) carry their own sentence in `error`.
  if (err instanceof ApiRequestError) {
    const message = (err.body as { error?: unknown } | null)?.error
    if (typeof message === 'string' && message !== '') return message
  }
  return err instanceof Error ? err.message : String(err)
}

interface DeleteWorktreeDialogProps {
  worktree: WorktreeSummary
  /** The dialog was dismissed (Close, Cancel, Escape) without deleting. */
  onClose: () => void
  /** The worktree is gone from disk. */
  onDeleted: () => void
}

/**
 * Deleting a worktree takes up to two steps. Uncommitted changes block it (nothing to confirm). Live sessions have to be archived first (one step, then
 * the delete confirm). Otherwise it goes straight to the confirm. Mount it while a worktree is picked; it always shows its dialog.
 */
export function DeleteWorktreeDialog({ worktree, onClose, onDeleted }: DeleteWorktreeDialogProps) {
  const sessionCount = worktree.sessions['code-review'] + worktree.sessions['pr-review'] + worktree.sessions['test-run']
  const [step, setStep] = useState<Step>(sessionCount > 0 ? 'archive' : 'delete')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onOpenChange = (open: boolean) => {
    if (!open) onClose()
  }

  if (worktree.uncommitted > 0) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Can't delete this worktree</DialogTitle>
            <DialogDescription>
              {worktree.name} has {pluralize(worktree.uncommitted, 'uncommitted change')}. Commit or discard them first, then delete it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    )
  }

  async function archiveAll() {
    setPending(true)
    setError(null)
    try {
      const detail = await fetchWorktree(worktree.id)
      for (const session of detail.linkedSessions) await archiveSession(session.id)
      setStep('delete')
    } catch (err) {
      setError(archiveErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    setPending(true)
    setError(null)
    try {
      await deleteWorktree(worktree.id)
      toast.success('Worktree deleted', { description: worktree.name })
      onDeleted()
    } catch (err) {
      setError(deleteErrorMessage(err))
      setPending(false)
    }
  }

  if (step === 'archive') {
    return (
      <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)} disablePointerDismissal>
        <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader className="pr-0">
            <DialogTitle>Archive sessions first?</DialogTitle>
            <DialogDescription>
              This worktree has {pluralize(sessionCount, 'session')}. Archive them first, then you can delete the worktree. You can restore them later.
            </DialogDescription>
          </DialogHeader>
          {error !== null && <Notice tone="err">{error}</Notice>}
          <DialogFooter>
            <DialogClose disabled={pending} render={<Button />}>Cancel</DialogClose>
            <Button variant="primary" disabled={pending} aria-busy={pending} onClick={() => void archiveAll()}>
              {pending ? 'Archiving…' : 'Archive sessions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete worktree?"
      description={
        <>
          Delete worktree from disk? <code className="font-mono text-xs text-ink">{worktree.path}</code>. The branch is kept.
        </>
      }
      confirmLabel="Delete"
      pendingLabel="Deleting…"
      pending={pending}
      error={error}
      onConfirm={() => void remove()}
    />
  )
}
