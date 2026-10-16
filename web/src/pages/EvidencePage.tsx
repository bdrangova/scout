import { useCallback, useMemo, useReducer } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { EmptySection } from '@/components/common/EmptySection'
import { EvidenceCarousel } from '@/components/evidence/EvidenceCarousel'
import { Kbd } from '@/components/ui/kbd'
import { pluralize } from '@/lib/format'
import { evidenceRoute } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { useHotkeys } from '@/lib/useHotkeys'
import { useReview } from '@/state/review-context'

/** `/s/:id/evidence/*path?`: the URL names the current item by its path in `evidence/` (default: the first). */
export function EvidencePage() {
  const { sessionId, detail } = useSessionContext()
  const params = useParams()
  const navigate = useNavigate()
  const { comments } = useReview()
  const [focusToken, bumpFocus] = useReducer((count: number) => count + 1, 0)
  const items = useMemo(() => [...detail.evidence].sort((a, b) => a.order - b.order), [detail.evidence])
  const onChange = useCallback((path: string) => navigate(evidenceRoute(sessionId, path), { replace: true }), [navigate, sessionId])

  useHotkeys({ comment: bumpFocus })

  const first = items[0]
  if (!first) {
    return (
      <EmptySection>
        No evidence: nothing in the session's <code className="font-mono">evidence/</code> folder.
      </EmptySection>
    )
  }

  const urlPath = params['*'] ?? ''
  const current = items.find((item) => item.path === urlPath)
  if (!current) return <Navigate to={evidenceRoute(sessionId, first.path)} replace />

  const open = comments.filter((comment) => comment.target.kind === 'evidence' && comment.status === 'open').length
  const images = items.filter((item) => item.type === 'image').length
  const videos = items.length - images

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-6 py-5">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">Evidence</h2>
        <span className="text-[13px] text-muted-foreground">
          {[images > 0 ? pluralize(images, 'screenshot') : null, videos > 0 ? pluralize(videos, 'recording') : null, open > 0 ? pluralize(open, 'open comment') : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd> item · <Kbd>C</Kbd> comment
        </span>
      </header>
      <EvidenceCarousel items={items} sessionId={sessionId} currentPath={current.path} onChange={onChange} commentFocusToken={focusToken} />
    </main>
  )
}
