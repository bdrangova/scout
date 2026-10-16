import type { SpecItem } from '@review-dash/shared'
import { ArtifactCard } from './ArtifactCard'
import { JiraCard } from './JiraCard'
import { MarkdownSpecCard } from './MarkdownSpecCard'

export interface SpecPanelProps {
  spec: readonly SpecItem[]
  sessionId: string
}

/** Jira tickets span the left column; markdown and artifact cards stack beside them (below 1100 px, all stack). */
export function SpecPanel({ spec, sessionId }: SpecPanelProps) {
  const jira = spec.filter((item) => item.type === 'jira')
  const rest = spec.filter((item) => item.type !== 'jira')
  const twoColumns = jira.length > 0 && rest.length > 0

  return (
    <div className={twoColumns ? 'grid grid-cols-1 items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : 'flex flex-col gap-5'}>
      {jira.length > 0 && (
        <div className="flex min-w-0 flex-col gap-5">
          {jira.map((item) => (
            <JiraCard key={item.path} item={item} sessionId={sessionId} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="flex min-w-0 flex-col gap-5">
          {rest.map((item) =>
            item.type === 'artifact' ? (
              <ArtifactCard key={item.path} item={item} sessionId={sessionId} />
            ) : (
              <MarkdownSpecCard key={item.path} item={item} sessionId={sessionId} />
            ),
          )}
        </div>
      )}
    </div>
  )
}
