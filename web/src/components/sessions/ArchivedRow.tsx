import type { ArchivedSession } from '@review-dash/shared'
import type { SessionKind } from '@/lib/paths'
import { ArchivedSessionCard } from './SessionCards'

export function ArchivedRow({ session, onUnarchive, onDelete, kind }: { session: ArchivedSession; onUnarchive: (session: ArchivedSession) => void; onDelete: (session: ArchivedSession) => void; kind?: SessionKind }) {
  return <ArchivedSessionCard session={session} onRestore={onUnarchive} onDelete={onDelete} kind={kind} layout="list" />
}
