import { FileText, Files } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { IconCount } from '@/components/common/IconCount'
import { PageHeader } from '@/components/common/PageHeader'
import { SpecPanel } from '@/components/spec/SpecPanel'
import { SpecRailSection } from '@/components/spec/SpecRailSection'
import { useCodeReviewDetail } from '@/lib/detail-kind'
import { useSessionContext } from '@/lib/session-context'
import { pluralize } from '@/lib/format'

/** The files of the session's `spec/` folder, as the server derived them (index.json titles, types by filename). */
export function SpecPage() {
  const { sessionId } = useSessionContext()
  const detail = useCodeReviewDetail()
  const spec = detail.spec

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-6 py-6">
      <PageHeader title="Spec" summary={spec.length > 0 ? <IconCount showLabel icon={Files} count={spec.length} label={pluralize(spec.length, 'source')} /> : null} />
      {spec.length > 0 && <SpecRailSection spec={spec} sessionId={sessionId} />}
      {spec.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No spec"
          description={
            <>
              Nothing in the session's <code className="font-mono">spec/</code> folder. A Jira ticket, a plan or an exported artifact would show here.
            </>
          }
        />
      ) : (
        <SpecPanel spec={spec} sessionId={sessionId} />
      )}
    </main>
  )
}
