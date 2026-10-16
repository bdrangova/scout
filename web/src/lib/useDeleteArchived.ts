import { useCallback, useState } from 'react'
import { archiveErrorMessage, deleteArchivedSession } from './archive'

export interface DeleteArchivedState {
  /** True while the DELETE request runs. */
  pending: boolean
  /** The last failure's message, cleared by the next attempt or `reset`. */
  error: string | null
  /** Resolves `true` on success (after `onDeleted`), `false` when the server refused. */
  remove: (id: string) => Promise<boolean>
  reset: () => void
}

/** The permanent-delete mutation for archived rows: one request at a time, errors kept for the dialog. */
export function useDeleteArchived(onDeleted: (id: string) => void): DeleteArchivedState {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = useCallback(
    async (id: string) => {
      setPending(true)
      setError(null)
      try {
        await deleteArchivedSession(id)
        onDeleted(id)
        return true
      } catch (err) {
        setError(archiveErrorMessage(err))
        return false
      } finally {
        setPending(false)
      }
    },
    [onDeleted],
  )
  const reset = useCallback(() => setError(null), [])

  return { pending, error, remove, reset }
}
