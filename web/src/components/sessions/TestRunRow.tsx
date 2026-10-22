import type { TestRunSummary } from '@review-dash/shared'
import { Archive, ChevronRight, Folder } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { StatusPill } from '@/components/session/StatusPill'
import { TicketStrip } from '@/components/session/TicketStrip'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Tag } from '@/components/ui/tag'
import { formatRelativeTime } from '@/lib/format'
import { sessionRoute } from '@/lib/paths'
import { statusSourceOf } from '@/lib/session-status'
import { cn } from '@/lib/utils'
import { SESSION_GRID, SESSION_META } from './grid'
import { ReviewProgress } from './ReviewProgress'

interface TestRunRowProps {
  session: TestRunSummary
  onArchive: (session: TestRunSummary) => void
}

const COUNT_TAGS = [
  { key: 'pass', label: 'pass', tone: 'ok' },
  { key: 'fail', label: 'fail', tone: 'err' },
  { key: 'gap', label: 'gap', tone: 'warn' },
  { key: 'na', label: 'n/a', tone: 'neutral' },
] as const

/** Last segment of the run folder (`.../test-runs/2026-10-21-diffing` → `2026-10-21-diffing`). */
function runFolderName(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed.slice(trimmed.lastIndexOf('/') + 1)
}

/** A live test run: like `SessionRow` (the whole panel links to the run), with the scenario counts where the diff stats are. */
export function TestRunRow({ session, onArchive }: TestRunRowProps) {
  const navigate = useNavigate()
  const href = sessionRoute('test-run', session.id)
  const subject = [session.run.feature, session.run.area].filter((part): part is string => part !== null && part !== '').join(' · ')

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate(href)
    }
  }

  // The row itself is the link: the button must not bubble its click (or Enter/Space) up to it.
  function onArchiveClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onArchive(session)
  }

  const counts = COUNT_TAGS.filter(({ key }) => session.counts[key] > 0)

  return (
    <li>
      <Panel
        role="link"
        tabIndex={0}
        aria-label={session.title}
        data-href={href}
        data-kind="test-run"
        onClick={() => navigate(href)}
        onKeyDown={onKeyDown}
        className={cn(
          SESSION_GRID,
          'group flex cursor-pointer flex-col gap-3 overflow-visible px-5 py-4 transition-[transform,background-color] duration-100',
          'hover:bg-paper-2 active:translate-[2px]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <TicketStrip tickets={session.tickets} className="max-w-[55%] shrink-0" />
            <span className="truncate text-[17px] font-bold tracking-[-.005em]" title={session.title}>
              {session.title}
            </span>
          </div>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-xs text-ink-muted">
            {subject !== '' && <span className="truncate font-sans font-semibold">{subject}</span>}
            <span className="inline-flex min-w-0 items-center gap-1" title={session.run.path}>
              <Folder className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{runFolderName(session.run.path)}</span>
            </span>
          </span>
        </div>
        <div className={SESSION_META}>
          <span className="flex flex-wrap items-center gap-1.5" aria-label={`${session.counts.scenarios} scenarios`}>
            {counts.length === 0 ? (
              <span className="text-[13px] text-ink-muted">{session.counts.scenarios} scenarios</span>
            ) : (
              counts.map(({ key, label, tone }) => (
                <Tag key={key} tone={tone} size="sm" title={`${session.counts[key]} ${label}`}>
                  {session.counts[key]} {label}
                </Tag>
              ))
            )}
          </span>
          <ReviewProgress reviewed={session.reviewed} total={session.total} />
          <div>
            <StatusPill summary={statusSourceOf(session)} showWord />
          </div>
          <time dateTime={session.updatedAt} title={`Updated ${formatRelativeTime(session.updatedAt)}`} className="text-[13px] font-medium text-ink-muted">
            {formatRelativeTime(session.updatedAt)}
          </time>
          <span className="ml-auto flex items-center gap-2 lg:ml-0 lg:justify-self-end">
            <Button
              size="icon-sm"
              aria-label={`Archive ${session.title}`}
              title="Archive test run"
              onClick={onArchiveClick}
              onKeyDown={(event) => event.stopPropagation()}
              className="size-[30px] rounded-[9px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-yellow hover:text-on-yellow focus-visible:opacity-100 [&_svg]:size-[15px]"
            >
              <Archive />
            </Button>
            <ChevronRight className="size-[18px] text-ink-muted" aria-hidden />
          </span>
        </div>
      </Panel>
    </li>
  )
}
