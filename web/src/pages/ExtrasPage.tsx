import { EmptySection } from '@/components/common/EmptySection'
import { ExtraCard } from '@/components/extras/ExtraCard'
import { pluralize } from '@/lib/format'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'

/** The files of the session's `extras/` folder (markdown, HTML, mermaid), one card each. */
export function ExtrasPage() {
  const { sessionId, detail } = useSessionContext()
  const { comments } = useReview()
  const extras = detail.extras

  if (extras.length === 0) {
    return (
      <EmptySection>
        No extras: nothing in the session's <code className="font-mono">extras/</code> folder.
      </EmptySection>
    )
  }

  const open = comments.filter((comment) => comment.target.kind === 'extra' && comment.status === 'open').length

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-6 py-5">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">Extras</h2>
        <span className="text-[13px] text-muted-foreground">
          {[pluralize(extras.length, 'item'), open > 0 ? pluralize(open, 'open comment') : null].filter(Boolean).join(' · ')}
        </span>
      </header>
      <div className="flex flex-col gap-5">
        {extras.map((item) => (
          <ExtraCard key={item.path} item={item} sessionId={sessionId} />
        ))}
      </div>
    </main>
  )
}
