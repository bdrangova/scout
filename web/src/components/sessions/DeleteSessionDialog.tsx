import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { archiveErrorMessage, deleteSession } from '@/lib/archive'

/**
 * Confirms and deletes a session for good (live or archived). The dialog renders in a portal, but React still bubbles its
 * events to the parent: callers inside a clickable row stop them there. `onDeleted` runs after the success toast.
 */
export function DeleteSessionDialog({ id, title, open, onOpenChange, onDeleted }: { id: string; title: string; open: boolean; onOpenChange: (open: boolean) => void; onDeleted: () => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setPending(true)
    setError(null)
    try {
      await deleteSession(id)
      onOpenChange(false)
      toast.success('Session deleted', { description: title })
      onDeleted()
    } catch (err) {
      setError(archiveErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) setError(null)
        onOpenChange(next)
      }}
      title="Delete this session permanently?"
      description={
        <>
          <span className="mb-1 block font-bold text-ink">{title}</span>
          Removes its review state, comments and run logs from disk; the repository and GitHub are not touched. This cannot be undone.
        </>
      }
      confirmLabel="Delete permanently"
      pendingLabel="Deleting…"
      onConfirm={() => void remove()}
      pending={pending}
      error={error}
    />
  )
}
