import { Files, MessageSquare } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/common/EmptyState'
import { IconCount } from '@/components/common/IconCount'
import { PageHeader } from '@/components/common/PageHeader'
import { JournalView } from '@/components/journal/JournalView'
import { ExtraCard } from '@/components/extras/ExtraCard'
import { ExtrasGrid } from '@/components/extras/ExtrasGrid'
import { ExtrasRailSection } from '@/components/extras/ExtrasRailSection'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { TARGET_ATTR } from '@/components/spec/rail-targets'
import { usePageMode } from '@/components/spec/usePageMode'
import { extrasViewOf, extrasViewSearch, journalNotes, TAB_PARAM, type ExtrasView } from '@/lib/extras-view'
import { pluralize } from '@/lib/format'
import { useCodeReviewDetail } from '@/lib/detail-kind'
import { useSessionContext } from '@/lib/session-context'
import { useOpenCommentCount } from '@/lib/useOpenCommentCount'

/**
 * The files of the session's `extras/` folder (markdown, HTML, mermaid), one card each, or a grid of tiles; with a journal, a switch at the top
 * shows Scout's journal instead (`?tab=journal`).
 */
export function ExtrasPage() {
  const { sessionId } = useSessionContext()
  const detail = useCodeReviewDetail()
  const open = useOpenCommentCount('extra')
  const extras = detail.extras
  const { mode, openInScroll } = usePageMode()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const notes = journalNotes(detail)
  const view = extrasViewOf(detail, searchParams.get(TAB_PARAM))
  const items = pluralize(extras.length, 'item')
  const openLabel = pluralize(open, 'open comment')

  function show(next: ExtrasView) {
    navigate({ search: extrasViewSearch(searchParams, next, detail) }, { replace: true })
  }

  if (view === 'journal') {
    return (
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-6 py-6">
        <PageHeader title="Journal" summary={`${pluralize(notes, 'note')} from Scout`} hint={<ViewSwitch view={view} extras={extras.length} notes={notes} onChange={show} />} />
        <JournalView />
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-6 py-6">
      <PageHeader
        title="Extras"
        hint={notes > 0 ? <ViewSwitch view={view} extras={extras.length} notes={notes} onChange={show} /> : undefined}
        summary={
          extras.length > 0 ? (
            <span role="group" aria-label={open > 0 ? `${items} · ${openLabel}` : items} className="inline-flex items-center gap-3">
              <IconCount showLabel icon={Files} count={extras.length} label={items} />
              {open > 0 && <IconCount showLabel icon={MessageSquare} count={open} label={openLabel} />}
            </span>
          ) : null
        }
      />
      {/* Keyed by the view: the rail follows the cards or the tiles, whichever is on the page. */}
      {extras.length > 0 && <ExtrasRailSection key={mode} extras={extras} />}
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
      ) : mode === 'grid' ? (
        <ExtrasGrid extras={extras} sessionId={sessionId} onOpen={openInScroll} />
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

/** Extras | Journal, each with its count; only rendered when the session has a journal. */
function ViewSwitch({ view, extras, notes, onChange }: { view: ExtrasView; extras: number; notes: number; onChange: (view: ExtrasView) => void }) {
  return (
    <Segmented aria-label="Extras view">
      <SegmentedItem pressed={view === 'extras'} count={extras} onClick={() => onChange('extras')}>
        Extras
      </SegmentedItem>
      <SegmentedItem pressed={view === 'journal'} count={notes} onClick={() => onChange('journal')}>
        Journal
      </SegmentedItem>
    </Segmented>
  )
}
