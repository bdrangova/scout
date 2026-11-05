import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { archiveErrorMessage, archiveSession, unarchiveSession } from '@/lib/archive'

/**
 * Archives the open session from its header. Reversible (the folder moves to `archive/`), but the
 * click leaves the page, so a toast says what happened and offers Undo: unarchive and come back to
 * where the reviewer was. `listPath` is the list the page returns to (`/t` for a test run).
 * `archive(true)` archives it as Done (finished, usually merged).
 */
export function useArchiveSession(id: string, listPath = '/'): { archiving: boolean; archive: (done?: boolean) => Promise<void> } {
  const navigate = useNavigate()
  const location = useLocation()
  const [archiving, setArchiving] = useState(false)

  async function archive(done = false) {
    const back = `${location.pathname}${location.search}`
    setArchiving(true)
    try {
      await archiveSession(id, done)
    } catch (err) {
      toast.error(archiveErrorMessage(err))
      setArchiving(false)
      return
    }
    toast(done ? 'Session marked done' : 'Session archived', {
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: () => {
          unarchiveSession(id).then(
            () => navigate(back),
            (err: unknown) => toast.error("Couldn't unarchive the session", { description: archiveErrorMessage(err) }),
          )
        },
      },
    })
    await navigate(listPath)
  }

  return { archiving, archive }
}
