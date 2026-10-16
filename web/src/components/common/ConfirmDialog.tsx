import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

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
 * A modal `alertdialog` for destructive confirmations: Cancel takes the initial focus, Escape
 * cancels, clicking outside does nothing (Base UI alert dialogs are not dismissible that way).
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, pendingLabel = 'Working…', onConfirm, pending = false, error = null }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <AlertDialog.Popup
          initialFocus={cancelRef}
          className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <div className="flex flex-col gap-2">
            <AlertDialog.Title className="font-heading text-base leading-none font-medium">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground">{description}</AlertDialog.Description>
          </div>
          {error !== null && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {error}
            </p>
          )}
          <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
            <AlertDialog.Close ref={cancelRef} disabled={pending} render={<Button variant="outline" />}>
              Cancel
            </AlertDialog.Close>
            <Button variant="destructive" disabled={pending} aria-busy={pending} onClick={onConfirm}>
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
