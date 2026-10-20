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
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
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

  it('renders the banner, the heading, the rows and their status notices', () => {
    renderPage({ sessions: sessionListFixture })
    expect(screen.getByRole('banner')).toHaveTextContent('Review Dash')
    expect(within(screen.getByRole('banner')).getByRole('group', { name: 'Colour theme' })).toBeInTheDocument()
    // No rail on the list: the bar is the wordmark, Shortcuts and the theme.
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Review sessions')

    const first = screen.getByRole('link', { name: 'Trial countdown bar' })
    expect(first).toHaveAttribute('data-href', `/s/${SESSION_ID}`)
    expect(within(first).getByRole('status', { name: 'Awaiting review' })).toHaveAttribute('data-status', 'unreviewed')
    expect(within(first).getByText('Awaiting review')).toBeInTheDocument()
    expect(within(first).getByText('+272')).toBeInTheDocument()
    expect(within(first).getByText('−51')).toBeInTheDocument()
    expect(within(first).getByLabelText('8 files')).toHaveTextContent('8')
    expect(within(first).getByRole('progressbar', { name: 'Reviewed 0 of 8' })).toBeInTheDocument()
    expect(within(first).getByText('0/8')).toBeInTheDocument()
    expect(within(first).getByText('qbdvision ·')).toBeInTheDocument()
    expect(within(first).getByTitle('Base branch')).toHaveTextContent('origin/main')
    expect(within(first).getByTitle('bojana-QI-15472-trial-bar')).toBeInTheDocument()
    expect(within(first).getByRole('link', { name: 'QI-15472' })).toHaveAttribute('href', 'https://example.atlassian.net/browse/QI-15472')
    expect(within(first).getByRole('button', { name: 'Archive Trial countdown bar' })).toHaveAttribute('title', 'Archive session')

    const updated = screen.getByRole('status', { name: 'Updated since sent · 2 open comments' })
    expect(updated).toHaveAttribute('data-status', 'updated')
    expect(updated).toHaveTextContent('2')
    expect(screen.getByRole('status', { name: 'In progress · 2 of 4' })).toBeInTheDocument()
    const working = screen.getByRole('status', { name: 'Changes sent · Request changes' })
    expect(working).toHaveAttribute('data-status', 'sent')
    expect(working.parentElement?.querySelector('[data-run="working"]')).toHaveAccessibleName('Agent working')
    expect(screen.getByRole('status', { name: 'Agent working' }).querySelector('[data-slot="status-dot"]')).not.toBeNull()
    expect(screen.getByRole('status', { name: 'Approved' })).toHaveAttribute('data-status', 'approved')

    const broken = screen.getByRole('listitem', { name: /Broken session/ })
    expect(broken).toHaveTextContent('20260920-0800-broken-manifest-0000')
    expect(broken).toHaveTextContent('repository not found')
    expect(broken).toHaveTextContent('Broken')
  })

  it('orders the rows by last activity, newest first, with broken sessions last', () => {
    renderPage({ sessions: [...sessionListFixture].reverse() })
    const rows = screen.getAllByRole('listitem')
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

  it('shows icon filter pills with counts and filters the rows', async () => {
    renderPage({ sessions: sessionListFixture })
    const user = userEvent.setup()
    const group = screen.getByRole('group', { name: 'Filter by status' })
    const all = within(group).getByRole('button', { name: 'All · 6' })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('title', 'All')
    expect(within(group).getByRole('button', { name: 'Awaiting review · 1' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'In progress · 1' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Changes sent · 1' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Ready to submit · 0' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Updated since sent · 1' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Approved · 1' })).toBeInTheDocument()
    // Archived is its own control, outside the status chip group.
    expect(screen.getByRole('button', { name: 'Archived · 0' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group).queryByRole('button', { name: /Archived/ })).not.toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: 'Approved · 1' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Storybook stories for Badge' })).toBeInTheDocument()
  })

  it('tells when no live row matches the filter', async () => {
    const first = sessionListFixture[0]
    if (!first || !('tickets' in first)) throw new Error('fixture')
    renderPage({ sessions: [first] })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Approved · 0' }))
    expect(screen.getByText('No sessions match this filter.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Trial countdown bar' })).not.toBeInTheDocument()
  })

  it('keeps many tickets on one scrollable line beside the title', () => {
    const first = sessionListFixture[0]
    if (!first || !('tickets' in first)) throw new Error('fixture')
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
    if (!first || !('tickets' in first)) throw new Error('fixture')
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

  it('archives a row from its hover action without opening the session, then hides it and reloads both lists', async () => {
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
    expect(screen.getByRole('button', { name: 'All · 5' })).toBeInTheDocument()
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
    // Archived rows share titles often, so the repo, the branch chip and the created time tell them apart.
    expect(within(row).getByText('qbdvision ·')).toBeInTheDocument()
    expect(within(row).getByTitle('bojana-QI-15001-spike')).toBeInTheDocument()
    // The base branch too, as on live rows (`base ← branch`).
    expect(within(row).getByTitle('Base branch')).toHaveTextContent('origin/master')
    expect(within(row).getByLabelText('merges into')).toBeInTheDocument()
    expect(within(row).getByText(/^· created/)).toBeInTheDocument()
    expect(within(row).getByText('Last week')).toHaveAttribute('dateTime', archivedFixture[0]?.createdAt)
    expect(within(row).getByText(/^Archived/)).toHaveTextContent('Archived 2 days ago')
    expect(within(row).getByText('2 days ago')).toHaveAttribute('title', archivedFixture[0]?.archivedAt)
    expect(within(row).getByText('2 days ago')).toHaveAttribute('dateTime', archivedFixture[0]?.archivedAt)
    expect(within(row).getByRole('link', { name: 'QI-15001' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Trial countdown bar' })).not.toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Unarchive Old trial bar spike' }))
    expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${archivedFixture[0]?.id}/unarchive`, expect.objectContaining({ method: 'POST' }))
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Archived session Old trial bar spike' })).not.toBeInTheDocument())
    expect(screen.getByText('No archived sessions.')).toBeInTheDocument()
    expect(reload).toHaveBeenCalledOnce()
    expect(reloadArchived).toHaveBeenCalledOnce()

    // The toggle flips back to the live list.
    await user.click(screen.getByRole('button', { name: 'Archived · 0' }))
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
