import { Film, Image, Images, MessageSquare } from 'lucide-react'
import { useCallback, useMemo, useReducer } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { IconCount } from '@/components/common/IconCount'
import { PageHeader } from '@/components/common/PageHeader'
import { evidenceCounts } from '@/components/evidence/evidence-counts'
import { EvidenceCarousel } from '@/components/evidence/EvidenceCarousel'
import { EvidenceNav } from '@/components/evidence/EvidenceNav'
import { EvidenceRail } from '@/components/evidence/EvidenceRail'
import { useEvidenceNav } from '@/components/evidence/useEvidenceNav'
import { Kbd } from '@/components/ui/kbd'
import { pluralize } from '@/lib/format'
import { evidenceRoute } from '@/lib/paths'
import { useCodeReviewDetail } from '@/lib/detail-kind'
import { useSessionContext } from '@/lib/session-context'
import { useHotkeys } from '@/lib/useHotkeys'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'

/** The page column: the viewport minus the bar, so the card (and its viewer) fit without page scroll. */
const COLUMN = 'mx-auto flex h-[calc(100dvh-var(--shell-h))] w-full max-w-[1400px] flex-col gap-4 overflow-y-auto px-6 py-4'

/** `/s/:id/evidence/*path?`: the URL names the current item by its path in `evidence/` (default: the first). The list is in the rail. */
export function EvidencePage() {
  const { sessionId } = useSessionContext()
  const detail = useCodeReviewDetail()
  const params = useParams()
  const navigate = useNavigate()
  const open = useOpenCommentCount('evidence')
  const [focusToken, bumpFocus] = useReducer((count: number) => count + 1, 0)
  const items = useMemo(() => [...detail.evidence].sort((a, b) => a.order - b.order), [detail.evidence])
  const onChange = useCallback((path: string) => navigate(evidenceRoute(sessionId, path), { replace: true }), [navigate, sessionId])
  const urlPath = params['*'] ?? ''
  const current = items.find((item) => item.path === urlPath)
  const nav = useEvidenceNav(items, current?.path ?? '', onChange)

  useHotkeys({ comment: bumpFocus })

  const first = items[0]
  if (!first) {
    return (
      <main className={COLUMN}>
        <PageHeader title="Evidence" />
        <EmptyState
          icon={Images}
          title="No evidence"
          description={
            <>
              Nothing in the session's <code className="font-mono">evidence/</code> folder. Screenshots and recordings the agent captures would show here.
            </>
          }
        />
      </main>
    )
  }
  if (!current) return <Navigate to={evidenceRoute(sessionId, first.path)} replace />

  const { images, videos } = evidenceCounts(items)
  const counts: { icon: typeof Image; count: number; label: string }[] = [
    { icon: Image, count: images, label: pluralize(images, 'screenshot') },
    { icon: Film, count: videos, label: pluralize(videos, 'recording') },
    { icon: MessageSquare, count: open, label: pluralize(open, 'open comment') },
  ].filter((entry) => entry.count > 0)

  return (
    <main className={COLUMN}>
      <EvidenceRail items={items} sessionId={sessionId} currentPath={current.path} onSelect={onChange} />
      <PageHeader
        title="Evidence"
        summary={
          <span role="group" aria-label={counts.map((entry) => entry.label).join(' · ')} className="inline-flex items-center gap-3">
            {counts.map((entry) => (
              <IconCount showLabel key={entry.label} icon={entry.icon} count={entry.count} label={entry.label} />
            ))}
          </span>
        }
        hint={
          <>
            <EvidenceNav index={nav.index} total={items.length} onGo={nav.go} />
            <span title="Comment" className="inline-flex items-center gap-1.5">
              <Kbd>C</Kbd>
              <MessageSquare aria-hidden className="size-[13px] lg:hidden" />
              <span className="hidden lg:inline">Comment</span>
            </span>
          </>
        }
      />
      <EvidenceCarousel items={items} sessionId={sessionId} index={nav.index} commentFocusToken={focusToken} />
    </main>
  )
}
