import type { SpecItem } from '@scout/shared'
import { ArtifactCard } from './ArtifactCard'
import { JiraCard } from './JiraCard'
import { MarkdownSpecCard } from './MarkdownSpecCard'
import { TARGET_ATTR } from './rail-targets'

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
            <div key={item.path} {...{ [TARGET_ATTR]: item.path }}>
              <JiraCard item={item} sessionId={sessionId} />
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="flex min-w-0 flex-col gap-5">
          {rest.map((item) => (
            <div key={item.path} {...{ [TARGET_ATTR]: item.path }}>
              {item.type === 'artifact' ? <ArtifactCard item={item} sessionId={sessionId} /> : <MarkdownSpecCard item={item} sessionId={sessionId} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
