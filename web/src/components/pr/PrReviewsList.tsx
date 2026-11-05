import type { AssignedPr, AssignedPrsProblem, PrStatus } from '@scout/shared'
import { Archive, ChevronRight, CircleDashed, GitPullRequest, RefreshCw } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'
import { ErrorState, LoadingState } from '@/components/sessions/SessionListStates'
import { SettingsDialog } from '@/components/worktrees/SettingsDialog'
import { useAssignedPrs } from '@/hooks/useAssignedPrs'
import { formatRelativeTime } from '@/lib/format'
import { SearchBox } from '@/components/sessions/SessionFilters'
import { matchesLocalSearch, matchesPrSearch } from '@/lib/github'
import { isClosedPr } from '@/lib/pr-status'
import { cn } from '@/lib/utils'
import { AssignedPrRow, LocalPrRow } from './PrRows'

const PROBLEM_COPY: Record<Exclude<AssignedPrsProblem, 'no-repos'>, { title: string; description: ReactNode }> = {
  'gh-missing': { title: 'Install the GitHub CLI (gh) on this Mac', description: 'Scout lists pull requests through gh.' },
  'not-authenticated': { title: 'Sign in to GitHub', description: <>Run <code className="font-mono text-xs">gh auth login</code> in a terminal, then refresh.</> },
}

/** Why the GitHub sections are missing, above the list; `action` sits on the right. */
function ProblemBanner({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border-fine border-dashed border-line px-5 py-4">
      <GitPullRequest aria-hidden className="size-5 shrink-0 text-ink-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 text-sm font-bold">{title}</p>
        <p className="m-0 text-[13px] text-ink-muted">{children}</p>
      </div>
      {action}
    </div>
  )
}

/** Rows a section shows before the rest scrolls inside it. */
const VISIBLE_ROWS = 5

/** Caps the list at the bottom edge of its `VISIBLE_ROWS`th row (rows wrap, so it is measured, and re-measured on resize). */
function useRowCap(count: number) {
  const ref = useRef<HTMLUListElement>(null)
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    const list = ref.current
    if (list === null || count <= VISIBLE_ROWS) {
      setMaxHeight(undefined)
      return
    }
    const measure = () => {
      const last = list.children[VISIBLE_ROWS - 1] as HTMLElement | undefined
      if (last !== undefined) setMaxHeight(last.getBoundingClientRect().bottom - list.getBoundingClientRect().top + list.scrollTop)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [count])
  return { ref, maxHeight }
}

type SectionView = 'open' | 'closed'

/** Open: pending, in progress or commented. Closed: approved, done, ignored or archived. */
function viewOf(row: { status: PrStatus }): SectionView {
  return isClosedPr(row.status) ? 'closed' : 'open'
}

/** One row of a section: its status picks the view, `matches` the search, `node` is the rendered row. */
interface SectionRow {
  key: string
  status: PrStatus
  matches: boolean
  node: ReactNode
}

const VIEW_LABEL: Record<SectionView, string> = { open: 'Open: pending, in progress or commented', closed: 'Closed: approved, done, ignored or archived' }

const COLLAPSED_KEY = 'scout.assigned-prs.collapsed'

/** Collapsed sections by key, remembered in this browser (a convenience: it may be missing or unavailable). */
function useCollapsed(key: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return (JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]).includes(key)
    } catch {
      return false
    }
  })
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      const keys = new Set(JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[])
      if (next) keys.add(key)
      else keys.delete(key)
      window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...keys]))
    } catch {
      // Not remembered; the toggle still works.
    }
  }
  return [collapsed, toggle]
}

/**
 * One section of PRs: a caret collapses it, Open | Closed picks which PRs show (the badge counts that view). Closed are approved,
 * done (reviewed and commented, nothing sent to the PR), ignored or archived.
 */
function Section({ id, title, empty, rows }: { id: string; title: string; empty: string; rows: readonly SectionRow[] }) {
  const [collapsed, toggle] = useCollapsed(id)
  const [view, setView] = useState<SectionView>('open')
  const inView = rows.filter((row) => viewOf(row) === view)
  const shown = inView.filter((row) => row.matches)
  const { ref: listRef, maxHeight } = useRowCap(shown.length)
  const listId = `assigned-${id}`
  const emptyLine = inView.length > 0 ? 'No PRs match your search.' : view === 'closed' ? 'Nothing closed yet' : empty
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-[15px] font-bold">
          <button type="button" aria-expanded={!collapsed} aria-controls={listId} onClick={toggle} className="inline-flex cursor-pointer items-center gap-2 rounded-md hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            <ChevronRight aria-hidden className={cn('size-4 transition-transform motion-reduce:transition-none', !collapsed && 'rotate-90')} />
            {title}
            <Badge variant="neutral" title={VIEW_LABEL[view]}>{inView.length}</Badge>
          </button>
        </h2>
        {/* Hidden, not removed, while collapsed: the header keeps its height, so the page doesn't jump. */}
        <Segmented aria-label={`${title}: open or closed`} aria-hidden={collapsed || undefined} className={cn('ml-auto', collapsed && 'invisible')}>
          <SegmentedItem pressed={view === 'open'} aria-label="Open" title={VIEW_LABEL.open} onClick={() => setView('open')}><CircleDashed aria-hidden /></SegmentedItem>
          <SegmentedItem pressed={view === 'closed'} aria-label="Closed" title={VIEW_LABEL.closed} onClick={() => setView('closed')}><Archive aria-hidden /></SegmentedItem>
        </Segmented>
      </div>
      {!collapsed && (
        <div id={listId}>
          {shown.length > 0 ? (
            <ul ref={listRef} style={{ maxHeight }} className="m-0 flex list-none flex-col gap-2.5 overflow-y-auto overscroll-contain p-0">{shown.map((row) => <Fragment key={row.key}>{row.node}</Fragment>)}</ul>
          ) : (
            <p className="m-0 rounded-2xl border-fine border-dashed border-line px-5 py-4 text-[13px] font-medium text-ink-muted">{emptyLine}</p>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * The PR reviews page: "My PRs" (PRs you wrote), the PRs asking for you, one section per configured team, then "Other" (your
 * reviews no section above covers), under one header row (title, when it was fetched, refresh, search). A GitHub problem (gh
 * missing or signed out, no repos) shows above the list; "Other" still lists your reviews. The search filters every section.
 */
export function PrReviewsList() {
  const { data, error, busy, refresh, reload } = useAssignedPrs()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [query, setQuery] = useState('')

  // One row: the page title, then when it was fetched, refresh and the search.
  const header = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <h1 className="m-0 mr-auto text-[26px] leading-[1.1] font-bold tracking-[-.01em]">PR reviews</h1>
      {data && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
          Fetched <time dateTime={data.fetchedAt} title={new Date(data.fetchedAt).toLocaleString()}>{formatRelativeTime(data.fetchedAt)}</time>
          <Button variant="ghost" size="icon-sm" title="Refresh" aria-label="Refresh PRs" disabled={busy} aria-busy={busy} onClick={refresh}>
            <RefreshCw aria-hidden className={busy ? 'animate-spin motion-reduce:animate-none' : undefined} />
          </Button>
        </span>
      )}
      <SearchBox query={query} onQuery={setQuery} placeholder="Search PRs…" label="Search PRs" title="Search by title, repository, number or author" />
    </div>
  )

  if (data === null) {
    return <div className="flex flex-col gap-5">{header}{error ? <ErrorState message={`Couldn't load the PRs: ${error.message}`} onRetry={reload} /> : <LoadingState label="Loading PRs…" />}</div>
  }
  const settings = <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} section="github" onSaved={reload} />
  const prRows = (prs: readonly AssignedPr[], showReviewers: boolean): SectionRow[] =>
    prs.map((pr) => ({ key: pr.url, status: pr.status, matches: matchesPrSearch(pr, query), node: <AssignedPrRow pr={pr} viewer={data.viewer} showReviewers={showReviewers} onChanged={reload} /> }))
  const otherRows: SectionRow[] = data.other.map((row) => ({ key: row.session.id, status: row.status, matches: matchesLocalSearch(row, query), node: <LocalPrRow row={row} onChanged={reload} /> }))

  return (
    <div className="flex flex-col gap-6">
      {header}
      {error && <Notice tone="warn">{`Couldn't refresh: ${error.message}`}</Notice>}
      {data.problem === 'no-repos' ? (
        <ProblemBanner title="No repositories followed yet" action={<Button variant="primary" size="sm" onClick={() => setSettingsOpen(true)}>Add repositories</Button>}>
          Pick the GitHub repositories Scout should watch for pull requests that need your review.
        </ProblemBanner>
      ) : data.problem !== null ? (
        <ProblemBanner title={PROBLEM_COPY[data.problem].title}>{PROBLEM_COPY[data.problem].description}</ProblemBanner>
      ) : (
        data.errors.length > 0 && (
          <ul aria-label="Repositories that failed" className="m-0 flex list-none flex-col gap-1.5 p-0">
            {data.errors.map((entry) => <li key={entry.repo}><Notice tone="warn">{`Couldn't load ${entry.repo}: ${entry.error}`}</Notice></li>)}
          </ul>
        )
      )}
      {data.problem === null && (
        <>
          <Section id="my-prs" title="My PRs" empty="No open PRs of yours" rows={prRows(data.authored, true)} />
          <Section id="mine" title="Assigned to me" empty="Nothing waiting for you" rows={prRows(data.assignedToMe, false)} />
          {data.teams.map((team) => <Section key={team.id} id={`team-${team.id}`} title={team.name} empty={`Nothing assigned to ${team.name}`} rows={prRows(team.prs, true)} />)}
        </>
      )}
      <Section id="other" title="Other" empty="No other reviews. Reviews you start on PRs outside these sections show here" rows={otherRows} />
      {settings}
    </div>
  )
}
