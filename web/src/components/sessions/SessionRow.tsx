import type { SessionSummary } from '@scout/shared'
import { LiveSessionCard } from './SessionCards'

/** Compact list layout shares the same information and interactions as the grid. */
export function SessionRow({ session, onArchive, onDone }: { session: SessionSummary; onArchive: (session: SessionSummary) => void; onDone?: (session: SessionSummary) => void }) {
  return <LiveSessionCard session={session} layout="list" onArchive={() => onArchive(session)} onDone={onDone && (() => onDone(session))} />
}
