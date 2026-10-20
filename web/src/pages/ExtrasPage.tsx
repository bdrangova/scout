import { Files, MessageSquare } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { IconCount } from '@/components/common/IconCount'
import { PageHeader } from '@/components/common/PageHeader'
import { ExtraCard } from '@/components/extras/ExtraCard'
import { ExtrasRailSection } from '@/components/extras/ExtrasRailSection'
import { TARGET_ATTR } from '@/components/spec/rail-targets'
import { pluralize } from '@/lib/format'
import { useSessionContext } from '@/lib/session-context'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'

/** The files of the session's `extras/` folder (markdown, HTML, mermaid), one card each. */
export function ExtrasPage() {
  const { sessionId, detail } = useSessionContext()
  const open = useOpenCommentCount('extra')
  const extras = detail.extras
  const items = pluralize(extras.length, 'item')
  const openLabel = pluralize(open, 'open comment')

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-6 py-6">
      <PageHeader
        title="Extras"
        summary={
          extras.length > 0 ? (
            <span role="group" aria-label={open > 0 ? `${items} · ${openLabel}` : items} className="inline-flex items-center gap-3">
              <IconCount showLabel icon={Files} count={extras.length} label={items} />
              {open > 0 && <IconCount showLabel icon={MessageSquare} count={open} label={openLabel} />}
            </span>
          ) : null
        }
      />
      {extras.length > 0 && <ExtrasRailSection extras={extras} />}
      {extras.length === 0 ? (
        <EmptyState
          icon={Files}
          title="No extras"
          description={
            <>
              Nothing in the session's <code className="font-mono">extras/</code> folder. Architecture notes, diagrams and reports the agent leaves there would show here.
            </>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {extras.map((item) => (
            <div key={item.path} {...{ [TARGET_ATTR]: item.path }}>
              <ExtraCard item={item} sessionId={sessionId} />
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
