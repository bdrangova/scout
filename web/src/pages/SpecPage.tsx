import { EmptySection } from '@/components/common/EmptySection'
import { SpecPanel } from '@/components/spec/SpecPanel'
import { pluralize } from '@/lib/format'
import { splitPath } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { useReview } from '@/state/review-context'

const KIND_LABEL = { jira: 'Jira ticket', markdown: 'markdown', artifact: 'exported artifact' } as const

/** The files of the session's `spec/` folder, as the server derived them (index.json titles, types by filename). */
export function SpecPage() {
  const { sessionId, detail } = useSessionContext()
  const { comments } = useReview()
  const spec = detail.spec

  if (spec.length === 0) {
    return (
      <EmptySection>
        No spec: nothing in the session's <code className="font-mono">spec/</code> folder.
      </EmptySection>
    )
  }

  const open = comments.filter((comment) => comment.target.kind === 'spec' && comment.status === 'open').length
  const summary = [...spec.map((item) => (item.type === 'markdown' ? splitPath(item.path).name : KIND_LABEL[item.type])), open > 0 ? pluralize(open, 'open comment') : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-6 py-5">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">Spec</h2>
        <span className="text-[13px] text-muted-foreground">{summary}</span>
      </header>
      <SpecPanel spec={spec} sessionId={sessionId} />
    </main>
  )
}
