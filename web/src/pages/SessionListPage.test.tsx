import type { ArchivedSession } from '@review-dash/shared'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArchivedListState, SessionListState } from '@/lib/hooks'
import { SESSION_ID, sessionListFixture } from '@/test/fixtures'
import { MockEventSource, stubEventSource } from '@/test/mock-event-source'
import { ThemeProvider } from '@/theme'
import { SessionListPage } from './SessionListPage'
import { SESSION_LAYOUT_KEY } from '@/components/sessions/session-list-layout'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

const listState = vi.hoisted(() => ({
  current: { sessions: null, loading: true, error: null, reload: () => {} } as SessionListState,
  archived: { archived: [], loading: false, error: null, reload: () => {} } as ArchivedListState,
}))

vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks')>()),
  useSessionList: () => listState.current,
  useArchivedSessions: () => listState.archived,
}))

const archivedFixture: ArchivedSession[] = [
  {
    id: '20260910-1200-old-trial-bar-dead',
    title: 'Old trial bar spike',
    tickets: [{ key: 'QI-15001', url: 'https://example.atlassian.net/browse/QI-15001' }],
    repo: { path: '/Users/bojana/Projects/qbdvision', branch: 'bojana-QI-15001-spike', baseRef: 'origin/master' },
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: '2026-09-11T09:00:00.000Z',
    archivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

function renderAt(initialEntries = ['/']) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/" element={<SessionListPage />} />
          <Route path="/s/:id" element={<p>Session route</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

function renderPage(state: Partial<SessionListState>, archived: Partial<ArchivedListState> = {}) {
  listState.current = { sessions: null, loading: false, error: null, reload: () => {}, ...state }
  listState.archived = { archived: [], loading: false, error: null, reload: () => {}, ...archived }
  return renderAt()
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('SessionListPage', () => {
  afterEach(() => {
    localStorage.removeItem(SESSION_LAYOUT_KEY)
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('uses matching status marks in cards and dropdown options, with keyboard filtering', async () => {
    renderPage({ sessions: sessionListFixture })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    const card = screen.getByRole('link', { name: 'Storybook stories for Badge' })
    const mark = card.querySelector('[data-status="approved"]')!
    const picker = screen.getByRole('combobox', { name: 'Review status' })
    await user.click(picker)
    const option = screen.getByRole('option', { name: 'Approved (1)' })
    const optionMark = option.querySelector('[data-status="approved"]')!
    expect(optionMark.className).toBe(mark.className)
    expect(optionMark.querySelector('svg')?.getAttribute('class')).toBe(mark.querySelector('svg')?.getAttribute('class'))
    await user.keyboard('{End}{Enter}')
    expect(picker).toHaveTextContent('Approved')
    expect(within(screen.getByRole('list', { name: 'Sessions' })).getAllByRole('listitem')).toHaveLength(1)
    await user.click(picker)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(picker).toHaveFocus()
  })

  it('remembers grid layout across archives and remounts, with compact searchable code details', async () => {
    const view = renderPage({ sessions: sessionListFixture }, { archived: archivedFixture })
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    const card = screen.getByRole('link', { name: 'Trial countdown bar' })
    expect(card).toHaveAttribute('data-layout', 'grid')
    expect(within(card).getByTitle('/Users/bojana/Projects/qbdvision')).toBeInTheDocument()
    expect(within(card).getByText('origin/main')).toBeInTheDocument()
    expect(within(card).getByText('+272')).toBeInTheDocument()
    expect(within(card).getByText('8 files')).toBeInTheDocument()
    expect(within(card).queryByText('Reviewed')).not.toBeInTheDocument()
    expect(within(card).getByLabelText('Base and current branch')).toHaveClass('overflow-x-auto', 'whitespace-nowrap')
    await user.type(screen.getByRole('searchbox'), 'Trial countdown')
    expect(within(screen.getByRole('list', { name: 'Sessions' })).getAllByRole('listitem')).toHaveLength(1)
    await user.clear(screen.getByRole('searchbox'))
    await user.click(screen.getByRole('button', { name: 'Archived · 1' }))
    const archive = screen.getByRole('listitem', { name: 'Archived session Old trial bar spike' })
    expect(within(archive).getByLabelText('Archive dates')).toHaveTextContent('Created')
    expect(within(archive).getByLabelText('Archive dates')).toHaveTextContent('Updated')
    expect(archive.querySelector('[data-layout="grid"]')).toBeInTheDocument()
    view.unmount()
    renderAt()
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.getByRole('link', { name: 'Trial countdown bar' })).not.toHaveAttribute('data-layout', 'grid')
  })

  it('opens grid cards with Enter while child controls keep their own actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { id: SESSION_ID }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage({ sessions: sessionListFixture })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    const card = screen.getByRole('link', { name: 'Trial countdown bar' })
    await user.click(within(card).getByRole('link', { name: 'QI-15472' }))
    expect(screen.queryByText('Session route')).not.toBeInTheDocument()
    const archive = within(card).getByRole('button', { name: 'Archive Trial countdown bar' })
    archive.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${SESSION_ID}/archive`, expect.objectContaining({ method: 'POST' })))
    expect(screen.queryByText('Session route')).not.toBeInTheDocument()
    const next = screen.getByRole('link', { name: 'Bulk export of batch records' })
    next.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('Session route')).toBeInTheDocument()
  })

  it('keeps grid restore functional and deletion behind its confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { id: archivedFixture[0]?.id }))
    vi.stubGlobal('fetch', fetchMock)
    renderPage({ sessions: [] }, { archived: archivedFixture })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    await user.click(screen.getByRole('button', { name: 'Archived · 1' }))
    await user.click(screen.getByRole('button', { name: 'Delete Old trial bar spike' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Restore Old trial bar spike' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${archivedFixture[0]?.id}/unarchive`, expect.objectContaining({ method: 'POST' })))
    expect(screen.getByText('No archived sessions.')).toBeInTheDocument()
  })

  it('refetches both lists once, 300 ms after a burst of store events', () => {
    vi.useFakeTimers()
    stubEventSource()
    const reload = vi.fn()
    const reloadArchived = vi.fn()
    renderPage({ sessions: sessionListFixture, reload }, { reload: reloadArchived })
    const source = MockEventSource.latest('/api/events')
    if (!source) throw new Error('no /api/events subscription')
    source.emit('message', { type: 'session.added', sessionId: 'a' })
    source.emit('message', { type: 'review.updated', sessionId: 'b' })
    source.emit('message', { type: 'run.updated', sessionId: 'c' })
    source.emit('message', { type: 'tree.updated', sessionId: 'd', fingerprint: '0123456789abcdef', durationMs: 12 })
    vi.advanceTimersByTime(250)
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(reload).toHaveBeenCalledOnce()
    expect(reloadArchived).toHaveBeenCalledOnce()
  })

  it('keeps session identity prominent, review activity distinct, and unavailable details out of the main list', async () => {
    renderPage({ sessions: sessionListFixture })
    expect(screen.getByRole('banner')).toHaveTextContent('Scout')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Development')
    const first = screen.getByRole('link', { name: 'Trial countdown bar' })
    expect(first).toHaveAttribute('data-href', `/s/${SESSION_ID}`)
    expect(within(first).getByRole('status', { name: 'Awaiting review' })).toHaveAttribute('data-status', 'unreviewed')
    expect(within(first).getByLabelText('8 files')).toHaveTextContent('8 files')
    expect(within(first).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(first).queryByText('+272')).not.toBeInTheDocument()
    expect(within(first).getByText('qbdvision')).toBeInTheDocument()
    expect(within(first).getByTitle('bojana-QI-15472-trial-bar → origin/main')).toBeInTheDocument()
    expect(within(first).getByRole('link', { name: 'QI-15472' })).toHaveAttribute('href', 'https://example.atlassian.net/browse/QI-15472')
    expect(within(first).getByRole('button', { name: 'Archive Trial countdown bar' })).toHaveAttribute('title', 'Archive session')
    expect(screen.getByRole('status', { name: 'Updated since sent · 2 open comments' })).toHaveAttribute('data-status', 'updated')
    expect(screen.getByText('2 open comments')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'In progress · 2 of 4' })).toBeInTheDocument()
    const working = screen.getByRole('status', { name: 'Review sent · Changes requested' })
    expect(working).toHaveAttribute('data-status', 'sent')
    expect(within(working.parentElement!).getByRole('status', { name: 'Agent working' })).toHaveAttribute('data-run', 'working')
    expect(screen.getByRole('status', { name: 'Approved' })).toHaveAttribute('data-status', 'approved')
    expect(screen.getByRole('listitem', { name: /Broken session/ }).closest('details')).not.toHaveAttribute('open')
    await userEvent.setup().click(screen.getByText('1 session unavailable'))
    expect(screen.getByRole('listitem', { name: /Broken session/ })).toHaveTextContent('repository not found')
  })

  it('orders the rows by last activity, newest first, with broken sessions last', () => {
    renderPage({ sessions: [...sessionListFixture].reverse() })
    const rows = screen.getAllByRole('listitem', { hidden: true })
    const titles = rows.map((row) => row.getAttribute('aria-label') ?? row.querySelector('[role="link"]')?.getAttribute('aria-label'))
    expect(titles).toEqual([
      'Trial countdown bar',
      'Bulk export of batch records',
      'Fix stale permissions cache',
      'Storybook stories for Badge',
      'Migrate Kendo grid to DataTable',
      'Broken session 20260920-0800-broken-manifest-0000',
    ])
  })

  it('filters by review status through one select, independently of the archive view', async () => {
    renderPage({ sessions: sessionListFixture })
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Sessions · 6' })).toHaveAttribute('aria-pressed', 'true')
    const filter = screen.getByRole('combobox', { name: 'Review status' })
    expect(filter).toHaveTextContent('All statuses')
    await user.click(filter)
    await user.click(screen.getByRole('option', { name: 'Approved (1)' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Storybook stories for Badge' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Archived · 0' }))
    expect(screen.queryByRole('combobox', { name: 'Review status' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Archived sessions')
    await user.click(screen.getByRole('button', { name: 'Sessions · 6' }))
    expect(screen.getByRole('combobox', { name: 'Review status' })).toHaveTextContent('Approved')
  })

  it('tells when no live row matches the filter', async () => {
    const first = sessionListFixture[0]
    if (!first || !('repo' in first)) throw new Error('fixture')
    renderPage({ sessions: [first] })
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Review status' }))
    await user.click(screen.getByRole('option', { name: 'Approved (0)' }))
    expect(screen.getByText('No sessions match this filter or search.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Trial countdown bar' })).not.toBeInTheDocument()
  })

  it('keeps many tickets on one scrollable line below the title', () => {
    const first = sessionListFixture[0]
    if (!first || !('repo' in first)) throw new Error('fixture')
    const tickets = [15472, 15473, 15480, 15491, 15502, 15510].map((n) => ({ key: `QI-${n}`, url: null }))
    renderPage({ sessions: [{ ...first, tickets }] })
    const row = screen.getByRole('link', { name: 'Trial countdown bar' })
    const chips = tickets.map((ticket) => within(row).getByText(ticket.key))
    const strip = chips[0]?.parentElement
    expect(strip).toHaveClass('overflow-x-auto', 'min-w-0')
    for (const chip of chips) expect(chip.parentElement).toBe(strip)
    expect(within(row).getByTitle('Trial countdown bar')).toHaveClass('truncate')
  })

  it('flags a row whose repository moved to another branch than the session was published on', () => {
    const first = sessionListFixture[0]
    if (!first || !('repo' in first)) throw new Error('fixture')
    renderPage({ sessions: [{ ...first, repo: { ...first.repo, branch: 'other-branch' } }] })
    const flag = screen.getByRole('status', { name: /Branch changed/ })
    expect(flag).toHaveAttribute('data-tone', 'warn')
    expect(flag).toHaveAttribute('title', expect.stringContaining('now on other-branch'))
  })

  it('navigates to the session on click and Enter, but not from the ticket link', async () => {
    renderPage({ sessions: sessionListFixture })
    const user = userEvent.setup()
    const row = screen.getByRole('link', { name: 'Trial countdown bar' })
    // The ticket chip is a real <a> inside a non-anchor row (anchors cannot nest).
    expect(row.tagName).not.toBe('A')
    await user.click(within(row).getByRole('link', { name: 'QI-15472' }))
    expect(screen.queryByText('Session route')).not.toBeInTheDocument()

    row.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Session route')).toBeInTheDocument()
  })

  it('archives a row from its visible archive action without opening the session, then hides it and reloads both lists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { id: SESSION_ID }))
    vi.stubGlobal('fetch', fetchMock)
    const reload = vi.fn()
    const reloadArchived = vi.fn()
    renderPage({ sessions: sessionListFixture, reload }, { reload: reloadArchived })
    const user = userEvent.setup()
    const row = screen.getByRole('link', { name: 'Trial countdown bar' })
    await user.click(within(row).getByRole('button', { name: 'Archive Trial countdown bar' }))
    expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${SESSION_ID}/archive`, expect.objectContaining({ method: 'POST' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Trial countdown bar' })).not.toBeInTheDocument())
    expect(screen.queryByText('Session route')).not.toBeInTheDocument()
    expect(reload).toHaveBeenCalledOnce()
    expect(reloadArchived).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Sessions · 5' })).toBeInTheDocument()
  })

  it('toasts instead of hiding the row when the server answers 409 run-active', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { error: 'run-active' })))
    renderPage({ sessions: sessionListFixture })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Archive Trial countdown bar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Claude Code is still working on this session'))
    expect(screen.getByRole('link', { name: 'Trial countdown bar' })).toBeInTheDocument()
  })

  it('lists archived sessions under the Archived filter and unarchives them from there', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { id: archivedFixture[0]?.id }))
    vi.stubGlobal('fetch', fetchMock)
    const reload = vi.fn()
    const reloadArchived = vi.fn()
    renderPage({ sessions: sessionListFixture, reload }, { archived: archivedFixture, reload: reloadArchived })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Archived · 1' }))
    expect(screen.getByRole('button', { name: 'Archived · 1' })).toHaveAttribute('aria-pressed', 'true')

    const row = screen.getByRole('listitem', { name: 'Archived session Old trial bar spike' })
    expect(row).not.toHaveAttribute('role', 'link')
    expect(within(row).queryByRole('link', { name: 'Old trial bar spike' })).not.toBeInTheDocument()
    expect(within(row).getByText('qbdvision')).toBeInTheDocument()
    expect(within(row).getByTitle('bojana-QI-15001-spike → origin/master')).toBeInTheDocument()
    expect(within(row).queryByText(/created/)).not.toBeInTheDocument()
    expect(within(row).getByText(/^Archived/)).toHaveTextContent('Archived 2 days ago')
    expect(within(row).getByText('2 days ago')).toHaveAttribute('title', archivedFixture[0]?.archivedAt)
    expect(within(row).getByText('2 days ago')).toHaveAttribute('dateTime', archivedFixture[0]?.archivedAt)
    expect(within(row).getByRole('link', { name: 'QI-15001' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Trial countdown bar' })).not.toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Restore Old trial bar spike' }))
    expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${archivedFixture[0]?.id}/unarchive`, expect.objectContaining({ method: 'POST' }))
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Archived session Old trial bar spike' })).not.toBeInTheDocument())
    expect(screen.getByText('No archived sessions.')).toBeInTheDocument()
    expect(reload).toHaveBeenCalledOnce()
    expect(reloadArchived).toHaveBeenCalledOnce()

    // The Sessions tab returns to the live list.
    await user.click(screen.getByRole('button', { name: 'Sessions · 6' }))
    expect(screen.getByRole('link', { name: 'Trial countdown bar' })).toBeInTheDocument()
  })

  it('shows the archived fetch error with a retry', async () => {
    const reloadArchived = vi.fn()
    renderPage({ sessions: sessionListFixture }, { error: new Error('disk gone'), reload: reloadArchived })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Archived · 0' }))
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the archived sessions: disk gone")
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reloadArchived).toHaveBeenCalledOnce()
  })

  it('searches across title, ticket, repository, and branch without opening a session', async () => {
    renderPage({ sessions: sessionListFixture })
    const user = userEvent.setup()
    const search = screen.getByRole('searchbox', { name: 'Search sessions' })
    await user.type(search, 'QI-15472 qbdvision')
    expect(screen.getByRole('link', { name: 'Trial countdown bar' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await user.clear(search)
    await user.type(search, 'no-matching-repository')
    expect(screen.getByText('No sessions match this filter or search.')).toBeInTheDocument()
  })

  it('searches archived sessions and distinguishes an empty search result', async () => {
    renderPage({ sessions: sessionListFixture }, { archived: archivedFixture })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Archived · 1' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search sessions' }), 'unknown-ticket')
    expect(screen.getByText('No archived sessions match your search.')).toBeInTheDocument()
    expect(screen.queryByText('No sessions yet')).not.toBeInTheDocument()
  })

  it('uses the archive loading state even when the live list has failed', async () => {
    renderPage({ sessions: sessionListFixture, error: new Error('live unavailable') }, { loading: true })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Archived · 0' }))
    expect(screen.getByText('Loading archived sessions…')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('No archived sessions.')).not.toBeInTheDocument()
  })

  it('offers an undo action that restores the archived session and refreshes both lists', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(200, { id: SESSION_ID }))
    vi.stubGlobal('fetch', fetchMock)
    const reload = vi.fn()
    const reloadArchived = vi.fn()
    renderPage({ sessions: sessionListFixture, reload }, { reload: reloadArchived })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Archive Trial countdown bar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Session archived', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })))
    const options = vi.mocked(toast.success).mock.calls.find(([message]) => message === 'Session archived')?.[1]
    if (!options?.action || typeof options.action !== 'object' || !('onClick' in options.action)) throw new Error('Missing Undo')
    options.action.onClick({} as React.MouseEvent<HTMLButtonElement>)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${SESSION_ID}/unarchive`, expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2))
    expect(reloadArchived).toHaveBeenCalledTimes(2)
  })

  describe('permanent delete', () => {
    async function openDeleteDialog(fetchMock: ReturnType<typeof vi.fn>, reloadArchived = vi.fn()) {
      vi.stubGlobal('fetch', fetchMock)
      renderPage({ sessions: sessionListFixture }, { archived: archivedFixture, reload: reloadArchived })
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Archived · 1' }))
      const row = screen.getByRole('listitem', { name: 'Archived session Old trial bar spike' })
      await user.click(within(row).getByRole('button', { name: 'Delete Old trial bar spike' }))
      const dialog = await screen.findByRole('alertdialog')
      return { user, row, dialog, reloadArchived }
    }

    it('opens a confirmation naming the session, and Cancel deletes nothing', async () => {
      const fetchMock = vi.fn()
      const { user, dialog } = await openDeleteDialog(fetchMock)
      expect(within(dialog).getByText('Delete this session permanently?')).toBeInTheDocument()
      expect(dialog).toHaveTextContent('Old trial bar spike')
      expect(dialog).toHaveTextContent('Removes its review state, comments and run logs from disk; the repository is not touched. This cannot be undone.')
      expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
      const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
      await waitFor(() => expect(cancel).toHaveFocus())
      await user.click(cancel)
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(fetchMock).not.toHaveBeenCalled()
      expect(screen.getByRole('listitem', { name: 'Archived session Old trial bar spike' })).toBeInTheDocument()
    })

    it('Escape cancels too', async () => {
      const fetchMock = vi.fn()
      const { user } = await openDeleteDialog(fetchMock)
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('confirming calls DELETE, removes the row and refetches the archived list', async () => {
      const fetchMock = vi.fn().mockResolvedValue(json(200, { id: archivedFixture[0]?.id }))
      const { user, dialog, reloadArchived } = await openDeleteDialog(fetchMock)
      await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
      expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/archived/${archivedFixture[0]?.id}`, expect.objectContaining({ method: 'DELETE' }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(screen.queryByRole('listitem', { name: 'Archived session Old trial bar spike' })).not.toBeInTheDocument()
      expect(screen.getByText('No archived sessions.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Archived · 0' })).toBeInTheDocument()
      expect(reloadArchived).toHaveBeenCalledOnce()
    })

    it('keeps the dialog open with the message when the server refuses', async () => {
      const fetchMock = vi.fn().mockResolvedValue(json(409, { error: 'run-active' }))
      const { user, dialog, reloadArchived } = await openDeleteDialog(fetchMock)
      await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Claude Code is still working on this session')
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Delete permanently' })).toBeEnabled()
      // The page behind the modal is inert while it is open, hence `hidden`.
      expect(screen.getByRole('listitem', { name: 'Archived session Old trial bar spike', hidden: true })).toBeInTheDocument()
      expect(reloadArchived).not.toHaveBeenCalled()
    })
  })

  it('shows the empty state, the loading state and the error state with a retry', async () => {
    const { unmount } = renderPage({ sessions: [] })
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    expect(screen.getByText('ai-review init --repo <path>')).toBeInTheDocument()
    unmount()

    const loading = renderPage({ loading: true })
    expect(screen.getByText('Loading sessions…')).toHaveAttribute('aria-busy', 'true')
    loading.unmount()

    const reload = vi.fn()
    renderPage({ error: new Error('connection refused'), reload })
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the sessions: connection refused")
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
