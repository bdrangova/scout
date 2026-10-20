import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Notice } from '@/components/ui/notice'

export interface ConfirmDialogProps {
  open: boolean
  /** Called with `false` when the user cancels (Cancel button or Escape). */
  onOpenChange: (open: boolean) => void
  title: string
  /** The body: what will happen, and what will not. */
  description: ReactNode
  /** The destructive action's label, and what it reads while the request runs. */
  confirmLabel: string
  pendingLabel?: string
  onConfirm: () => void
  /** Disables both buttons and labels the confirm one as working. */
  pending?: boolean
  /** Shown under the description, so a failed attempt keeps the dialog open with its reason. */
  error?: string | null
}

/**
 * A modal `alertdialog` for destructive confirmations on the shared `Dialog` primitive: Cancel takes
 * the initial focus, Escape cancels, clicking outside does nothing.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, pendingLabel = 'Working…', onConfirm, pending = false, error = null }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)} disablePointerDismissal>
      <DialogContent role="alertdialog" initialFocus={cancelRef} showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader className="pr-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error !== null && <Notice tone="err">{error}</Notice>}
        <DialogFooter>
          <DialogClose ref={cancelRef} disabled={pending} render={<Button />}>
            Cancel
          </DialogClose>
          <Button variant="reject" disabled={pending} aria-busy={pending} onClick={onConfirm}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
