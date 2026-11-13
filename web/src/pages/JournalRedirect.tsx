import { Navigate, useParams } from 'react-router'
import { sessionRoute } from '@/lib/paths'

/** The old `/s/:id/journal` route: the journal now lives in the Extras page. */
export function JournalRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`${sessionRoute('code-review', id, 'extras')}?tab=journal`} replace />
}
