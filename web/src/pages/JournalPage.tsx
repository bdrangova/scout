import { type JournalEntry, type JournalKind } from '@scout/shared'
import { NotebookText } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ScoutMark } from '@/components/brand/Scout'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { JournalEntryCard } from '@/components/journal/JournalEntryCard'
import { useCodeReviewDetail } from '@/lib/detail-kind'
import { pluralize } from '@/lib/format'
import { replyTargetFor } from '@/lib/journal-reply'
import { dayHeading, dayKey, KIND_LABEL, KINDS } from '@/lib/journal-view'
import { requestLineJump } from '@/lib/line-jump'
import { fileRoute } from '@/lib/paths'
import { useSessionContext } from '@/lib/session-context'
import { cn } from '@/lib/utils'
import { useJournalState } from '@/state/journal-context'
import { useReview } from '@/state/review-context'

/** The file filter's value for notes that belong to no file. */
const SESSION_LEVEL = '\u0000session'

const CHIP = 'inline-flex h-6 items-center rounded-full border-fine border-line bg-paper px-2.5 text-[11.5px] font-bold transition-colors hover:bg-hover aria-pressed:border-ink aria-pressed:bg-yellow aria-pressed:text-on-yellow'

/** Scout's journal: every note of the session in the order it was written, grouped by day, filterable by kind and file. */
export function JournalPage() {
  const { sessionId } = useSessionContext()
  const detail = useCodeReviewDetail()
  const { dispatch } = useReview()
  const { journal } = useJournalState()
  const navigate = useNavigate()
  const [kinds, setKinds] = useState<ReadonlySet<JournalKind>>(new Set())
  const [file, setFile] = useState('')
  const [replying, setReplying] = useState<string | null>(null)

  const entries = useMemo(() => journal?.entries ?? [], [journal])
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const files = useMemo(() => [...new Set(entries.flatMap((entry) => (entry.file === null ? [] : [entry.file])))].sort(), [entries])
  const inDiff = useMemo(() => new Set(detail.tree.files.map((treeFile) => treeFile.path)), [detail.tree.files])
  const shown = useMemo(
    () => entries.filter((entry) => (kinds.size === 0 || kinds.has(entry.kind)) && (file === '' || (file === SESSION_LEVEL ? entry.file === null : entry.file === file))),
    [entries, kinds, file],
  )
  const days = useMemo(() => {
    const groups: { key: string; entries: JournalEntry[] }[] = []
    for (const entry of shown) {
      const key = dayKey(entry.createdAt)
      const last = groups.at(-1)
      if (last?.key === key) last.entries.push(entry)
      else groups.push({ key, entries: [entry] })
    }
    return groups
  }, [shown])
  const live = entries.filter((entry) => entry.supersededBy === undefined).length

  function toggleKind(kind: JournalKind) {
    const next = new Set(kinds)
    if (!next.delete(kind)) next.add(kind)
    setKinds(next)
  }

  function openFile(entry: JournalEntry) {
    if (entry.file === null) return
    navigate(fileRoute(sessionId, entry.file))
    if (entry.anchor) requestLineJump(entry.file, entry.anchor.side, entry.anchor.line)
  }

  function showEntry(id: string) {
    // The replacement may be filtered out: show everything so the link always lands.
    setKinds(new Set())
    setFile('')
    requestAnimationFrame(() => document.getElementById(`journal-${id}`)?.scrollIntoView({ block: 'center' }))
  }

  async function submitReply(entry: JournalEntry, body: string) {
    const target = await replyTargetFor(entry, sessionId)
    dispatch({ type: 'ADD_COMMENT', target, body, about: entry.id })
    setReplying(null)
    toast.success(target.kind === 'overall' ? 'Reply added to the overall comments' : `Reply added to ${target.ref ?? ''}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-5 px-6 py-6">
      <PageHeader title="Journal" summary={entries.length > 0 ? `${pluralize(live, 'note')} from Scout` : null} />
      {entries.length === 0 ? (
        <EmptyState icon={NotebookText} title="No notes yet" description="Scout writes a note when it makes a decision worth explaining. They show here and under the lines they are about." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Filter by kind" className="flex flex-wrap items-center gap-1.5">
              {KINDS.map((kind) => (
                <button key={kind} type="button" aria-pressed={kinds.has(kind)} onClick={() => toggleKind(kind)} className={CHIP}>
                  {KIND_LABEL[kind]}
                </button>
              ))}
            </div>
            <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-ink-muted">
              File
              <select value={file} onChange={(event) => setFile(event.target.value)} className={cn('h-8 max-w-[320px] rounded-lg border-fine border-line bg-surface px-2 text-[13px] font-medium text-ink')}>
                <option value="">All files</option>
                <option value={SESSION_LEVEL}>Session-level</option>
                {files.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {shown.length === 0 ? (
            <p className="m-0 text-[13px] text-ink-muted">No notes match these filters.</p>
          ) : (
            days.map((day) => (
              <section key={day.key} aria-label={dayHeading(day.key)} className="flex flex-col gap-3">
                <h2 className="m-0 flex items-center gap-2 text-[13px] font-bold text-ink-muted">
                  <ScoutMark className="size-5" />
                  {dayHeading(day.key)}
                </h2>
                {day.entries.map((entry) => (
                  <Fragment key={entry.id}>
                    <JournalEntryCard
                      entry={entry}
                      fileLinked={entry.file !== null && inDiff.has(entry.file)}
                      onOpenFile={openFile}
                      replacement={entry.supersededBy ? (byId.get(entry.supersededBy) ?? null) : null}
                      onShowEntry={showEntry}
                      replying={replying === entry.id}
                      onReply={(target) => setReplying(target.id)}
                      onCancelReply={() => setReplying(null)}
                      onSubmitReply={(target, body) => void submitReply(target, body)}
                    />
                  </Fragment>
                ))}
              </section>
            ))
          )}
        </>
      )}
    </main>
  )
}
