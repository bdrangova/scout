import type { WorktreeSummary } from '@scout/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { StepList } from '@/components/common/StepList'
import { endStep, startStep } from '@/components/common/steps'
import type { Step as ProgressStep } from '@/components/common/steps'
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
  /** What the dialog has done and is doing, kept across both steps so the confirm still shows the archived sessions. */
  const [progress, setProgress] = useState<ProgressStep[]>([])
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
    let steps: ProgressStep[] = startStep([{ label: 'Finding the sessions', state: 'pending' }], 0)
    let current = 0
    setProgress(steps)
    try {
      const detail = await fetchWorktree(worktree.id)
      steps = endStep(steps, 0, 'done')
      steps = [...steps, ...detail.linkedSessions.map((s, i): ProgressStep => ({ label: `Archiving ${('title' in s && s.title) || s.id} (${i + 1} of ${detail.linkedSessions.length})`, state: 'pending' }))]
      setProgress(steps)
      for (const [i, session] of detail.linkedSessions.entries()) {
        current = i + 1
        steps = startStep(steps, current)
        setProgress(steps)
        await archiveSession(session.id)
        steps = endStep(steps, current, 'done')
        setProgress(steps)
      }
      setStep('delete')
    } catch (err) {
      setProgress(endStep(steps, current, 'failed'))
      setError(archiveErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    setPending(true)
    setError(null)
    // Drop a failed earlier delete attempt, keep the archive steps.
    let steps: ProgressStep[] = [...progress.filter((s) => s.state === 'done'), { label: 'Removing the worktree folder from disk', state: 'pending' }]
    const index = steps.length - 1
    steps = startStep(steps, index)
    setProgress(steps)
    try {
      await deleteWorktree(worktree.id)
      setProgress(endStep(steps, index, 'done'))
      toast.success('Worktree deleted', { description: worktree.name })
      onDeleted()
    } catch (err) {
      setProgress(endStep(steps, index, 'failed'))
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
          {progress.length > 0 && <StepList steps={progress} />}
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
      progress={
        progress.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <StepList steps={progress} />
            {pending && <p className="text-xs text-ink-muted">Big folders (dependencies, build output) can take a minute or two.</p>}
          </div>
        )
      }
      onConfirm={() => void remove()}
    />
  )
}
