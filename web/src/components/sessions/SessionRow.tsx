import type { SessionSummary } from '@review-dash/shared'
import { LiveSessionCard } from './SessionCards'

/** Compact list layout shares the same information and interactions as the grid. */
export function SessionRow({ session, onArchive }: { session: SessionSummary; onArchive: (session: SessionSummary) => void }) {
  return <LiveSessionCard session={session} layout="list" onArchive={() => onArchive(session)} />
}
