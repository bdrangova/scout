import type { WorktreeListResponse } from '@scout/shared'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SESSION_LAYOUT_KEY } from '@/components/sessions/session-list-layout'
import { sessionSummary, worktreeSummary } from '@/test/fixtures'
import { calls, json, stubApi } from '@/test/worktree-api'
import { ThemeProvider } from '@/theme'
import { WorktreesPage } from './WorktreesPage'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

const FOLDER = '/Users/bojana/worktrees'
const NO_GITHUB = { repos: [], teams: [] }
const CLEAN = worktreeSummary({ id: 'aaaaaaaaaaaa', name: 'trial-bar', sessions: { 'code-review': 2, 'pr-review': 0, 'test-run': 1 }, pr: { number: 812, url: 'https://github.com/qbd/qbd/pull/812', state: 'open', title: 'Trial bar', baseRef: 'master', headRef: 'bojana-qi-15472-trial-bar', updatedAt: '2026-10-20T10:00:00.000Z' } })
const DIRTY = worktreeSummary({ id: 'bbbbbbbbbbbb', name: 'bulk-export', branch: 'bojana-qi-15410-bulk-export', ticket: 'QI-15410', uncommitted: 4, ahead: null, behind: null })
const FREE = worktreeSummary({ id: 'cccccccccccc', name: 'spike', branch: null, ticket: null, baseRef: null })

function list(patch: Partial<WorktreeListResponse> = {}): WorktreeListResponse {
  return { folders: [FOLDER], items: [CLEAN, DIRTY, FREE], errors: [], ...patch }
}

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<WorktreesPage />} />
          <Route path="/w/:id" element={<p>Detail route</p>} />
          <Route path="/d" element={<p>Development route</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('WorktreesPage', () => {
  afterEach(() => {
    localStorage.removeItem(SESSION_LAYOUT_KEY)
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('asks for folders when none are configured, and saves them from the Settings dialog', async () => {
    let saved = { worktreeFolders: [] as string[], github: NO_GITHUB }
    let current = list({ folders: [], items: [] })
    const fetchMock = stubApi({
      'GET /api/worktrees': () => json(200, current),
      'GET /api/settings': () => json(200, saved),
      'PUT /api/settings': (init) => {
        saved = JSON.parse(String(init?.body)) as typeof saved
        current = list({ items: [CLEAN] })
        return json(200, saved)
      },
    })
    renderPage()
    const user = userEvent.setup()
    expect(await screen.findByText('No worktree folders')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add folders in Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    await user.type(await within(dialog).findByLabelText('New folder path'), 'relative/path')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('absolute path')
    await user.clear(within(dialog).getByLabelText('New folder path'))
    await user.type(within(dialog).getByLabelText('New folder path'), `${FOLDER}/{Enter}`)
    expect(within(dialog).getByText(FOLDER)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument())
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ worktreeFolders: [FOLDER], github: NO_GITHUB })
    expect(await screen.findByRole('link', { name: 'trial-bar' })).toBeInTheDocument()
  })

  it('shows a failed save inside the dialog and keeps it open', async () => {
    stubApi({
      'GET /api/worktrees': () => json(200, list()),
      'GET /api/settings': () => json(200, { worktreeFolders: [FOLDER], github: NO_GITHUB }),
      'PUT /api/settings': () => json(400, { error: 'folder does not exist' }),
    })
    renderPage()
    const user = userEvent.setup()
    await screen.findByRole('link', { name: 'trial-bar' })
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    await user.click(await within(dialog).findByRole('button', { name: `Remove ${FOLDER}` }))
    expect(within(dialog).getByText('No folders yet.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('folder does not exist')
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('adds a folder chosen with Browse, and ignores a cancelled pick', async () => {
    const picks = ['/Users/bojana/picked', null]
    stubApi({
      'GET /api/worktrees': () => json(200, list()),
      'GET /api/settings': () => json(200, { worktreeFolders: [FOLDER], github: NO_GITHUB }),
      'POST /api/settings/pick-folder': () => json(200, { path: picks.shift() ?? null }),
    })
    renderPage()
    const user = userEvent.setup()
    await screen.findByRole('link', { name: 'trial-bar' })
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    await user.click(await within(dialog).findByRole('button', { name: 'Browse…' }))
    expect(await within(dialog).findByText('/Users/bojana/picked')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Browse…' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Browse…' })).toBeEnabled())
    expect(within(dialog).getAllByRole('button', { name: /^Remove / })).toHaveLength(2)
  })

  it('names the folders when they hold no worktrees, and reports unreadable folders', async () => {
    stubApi({ 'GET /api/worktrees': () => json(200, list({ items: [], errors: [{ folder: '/gone', error: 'not found' }] })) })
    renderPage()
    expect(await screen.findByText('No worktrees')).toBeInTheDocument()
    expect(screen.getByText(FOLDER)).toBeInTheDocument()
    expect(screen.getByText("Can't read /gone: not found")).toBeInTheDocument()
  })

  it('shows the load error with a retry', async () => {
    stubApi({ 'GET /api/worktrees': () => json(500, { error: 'boom' }) })
    renderPage()
    expect(await screen.findByText(/Couldn't load the worktrees/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders what each card knows, searches, and opens the detail', async () => {
    stubApi({ 'GET /api/worktrees': () => json(200, list()) })
    renderPage()
    const user = userEvent.setup()
    const card = await screen.findByRole('link', { name: 'trial-bar' })
    expect(within(card).getByText('QI-15472')).toBeInTheDocument()
    expect(within(card).getByText('origin/master')).toBeInTheDocument()
    expect(within(card).getByText('bojana-qi-15472-trial-bar')).toBeInTheDocument()
    expect(within(card).getByText('8 files')).toBeInTheDocument()
    expect(within(card).getByText('+272')).toBeInTheDocument()
    expect(within(card).getByText('3 ahead · 1 behind')).toBeInTheDocument()
    expect(within(card).queryByText(/uncommitted/)).not.toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'PR #812 · open' })).toHaveAttribute('href', 'https://github.com/qbd/qbd/pull/812')
    expect(within(card).getByTitle('/Users/bojana/Projects/qbdvision')).toHaveTextContent('qbdvision')
    expect(within(card).getByTitle(`${FOLDER}/trial-bar`)).toBeInTheDocument()
    expect(within(card).getByText('Dev 2')).toBeInTheDocument()
    expect(within(card).getByText('Test 1')).toBeInTheDocument()
    expect(within(card).queryByText(/PR 0|Dev 0/)).not.toBeInTheDocument()
    const dirty = screen.getByRole('link', { name: 'bulk-export' })
    expect(within(dirty).getByText('4 uncommitted')).toBeInTheDocument()
    expect(within(dirty).getByText('No sessions')).toBeInTheDocument()
    expect(within(dirty).queryByText(/ahead/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: 'spike' })).getByText('Detached HEAD')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox'), 'QI-15410')
    expect(within(screen.getByRole('list', { name: 'Worktrees' })).getAllByRole('listitem')).toHaveLength(1)
    await user.clear(screen.getByRole('searchbox'))
    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    expect(screen.getByRole('link', { name: 'trial-bar' })).toHaveAttribute('data-layout', 'grid')
    await user.click(screen.getByRole('link', { name: 'trial-bar' }))
    expect(screen.getByText('Detail route')).toBeInTheDocument()
  })

  it('refuses to delete a worktree with uncommitted changes', async () => {
    const fetchMock = stubApi({ 'GET /api/worktrees': () => json(200, list()) })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete worktree bulk-export' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('4 uncommitted changes')
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByText('Detail route')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(calls(fetchMock).some((call) => call.startsWith('DELETE'))).toBe(false)
  })

  it('archives the linked sessions first, then deletes the worktree', async () => {
    let deleted = false
    const detail = { ...CLEAN, linkedSessions: [sessionSummary({ id: 's1', title: 'One' }), sessionSummary({ id: 's2', title: 'Two' })] }
    const fetchMock = stubApi({
      'GET /api/worktrees': () => json(200, list({ items: deleted ? [DIRTY, FREE] : [CLEAN, DIRTY, FREE] })),
      'GET /api/worktrees/aaaaaaaaaaaa': () => json(200, detail),
      'POST /api/sessions/s1/archive': () => json(200, { id: 's1' }),
      'POST /api/sessions/s2/archive': () => json(200, { id: 's2' }),
      'DELETE /api/worktrees/aaaaaaaaaaaa': () => {
        deleted = true
        return new Response(null, { status: 204 })
      },
    })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete worktree trial-bar' }))
    const archive = await screen.findByRole('alertdialog')
    expect(archive).toHaveTextContent('This worktree has 3 sessions. Archive them first')
    await user.click(within(archive).getByRole('button', { name: 'Archive sessions' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete worktree?' })
    expect(confirm).toHaveTextContent(`${FOLDER}/trial-bar`)
    expect(confirm).toHaveTextContent('The branch is kept')
    expect(calls(fetchMock)).toEqual(expect.arrayContaining(['POST /api/sessions/s1/archive', 'POST /api/sessions/s2/archive']))
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Worktree deleted', { description: 'trial-bar' }))
    expect(screen.queryByRole('link', { name: 'trial-bar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('goes straight to the delete confirm without sessions and shows a refusal in the dialog', async () => {
    stubApi({
      'GET /api/worktrees': () => json(200, list()),
      'DELETE /api/worktrees/cccccccccccc': () => json(409, { error: 'conflict', reason: 'sessions' }),
      'DELETE /api/worktrees/bbbbbbbbbbbb': () => json(409, { error: 'git refused: worktree is locked', reason: 'git' }),
    })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete worktree spike' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete worktree?' })
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    expect(await within(confirm).findByRole('alert')).toHaveTextContent('still has sessions')
    expect(screen.getByRole('link', { name: 'spike', hidden: true })).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })
})
