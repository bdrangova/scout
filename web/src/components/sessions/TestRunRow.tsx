import type { TestRunSummary } from '@scout/shared'
import { LiveSessionCard } from './SessionCards'

/** Compact list layout shares the same information and interactions as the grid. */
export function TestRunRow({ session, onArchive }: { session: TestRunSummary; onArchive: (session: TestRunSummary) => void }) {
  return <LiveSessionCard session={session} layout="list" onArchive={() => onArchive(session)} />
}
