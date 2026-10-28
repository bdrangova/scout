import type { SessionDetail } from '@review-dash/shared'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fp, makeTreeFile, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture, withChangedFile } from '@/test/fixtures'
import { mockReviewApi, urlOf } from '@/test/mock-api'
import { MockEventSource, stubEventSource } from '@/test/mock-event-source'
import { ThemeProvider } from '@/theme/ThemeProvider'
import { FilesPage } from './FilesPage'
import { SessionLayout } from './SessionLayout'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() }),
}))

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch-diff">{patch}</pre>,
  WorkerPoolContextProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const F0 = sessionDetailFixture.tree.files[0]
if (!F0) throw new Error('fixture too small')
const P0 = F0.path

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

interface Options {
  review?: ReturnType<typeof reviewResponseFixture>
  /** The first detail response (default: the fixture); later ones come from `publish`. */
  detail?: SessionDetail | Response
}

function renderLayout({ review = reviewResponseFixture(), detail = sessionDetailFixture }: Options = {}) {
  stubEventSource()
  const api = mockReviewApi(review)
  const base = api.fetchMock.getMockImplementation()
  const details: (SessionDetail | Response)[] = [detail]
  let detailGets = 0
  api.fetchMock.mockImplementation(async (input, init) => {
    const url = urlOf(input)
    if ((init?.method ?? 'GET') === 'GET' && url.endsWith(`/sessions/${SESSION_ID}`)) {
      detailGets += 1
      const latest = details[details.length - 1]
      return latest instanceof Response ? latest.clone() : json(200, latest)
    }
    if (!base) return json(404, {})
    return base(input, init)
  })
  render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={[`/s/${SESSION_ID}/files`]}>
        <Routes>
          <Route path="/d" element={<p>Sessions list</p>} />
          <Route path="/s/:id" element={<SessionLayout />}>
            <Route path="files" element={<FilesPage />} />
            <Route path="files/*" element={<FilesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
  return {
    api,
    publish: (next: SessionDetail | Response) => details.push(next),
    detailGets: () => detailGets,
    events: () => {
      const source = MockEventSource.latest('/api/events')
      if (!source) throw new Error('no /api/events source')
      return source
    },
  }
}

const header = () => screen.findByRole('banner')
const rail = () => screen.findByRole('complementary', { name: 'Session panel' })

async function archiveFromMenu(banner: HTMLElement) {
  fireEvent.click(within(banner).getByRole('button', { name: 'More actions' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive session' }))
}

describe('SessionLayout', () => {
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('puts the identity, the status and the progress in the rail (roomy) and none of them in the bar', async () => {
    window.localStorage.setItem('review-dash:rail-density:files', 'roomy')
    renderLayout()
    const banner = await header()
    const side = await rail()
    expect(within(side).getByText('0/6')).toBeInTheDocument()
    expect(within(side).getByText('+2,556')).toBeInTheDocument()
    expect(within(side).getByLabelText('Repository qbdvision')).toBeInTheDocument()
    expect(within(side).getByTitle(/^Base branch\. The diff is against the merge-base bbbbbbb/)).toHaveTextContent('origin/main')
    expect(within(side).getByTitle('bojana-QI-15472-trial-bar')).toBeInTheDocument()
    expect(within(banner).getByRole('link', { name: /Evidence/ })).toHaveTextContent('2')
    expect(within(banner).queryByText('+2,556')).not.toBeInTheDocument()
  })

  it('shows the title alone on Files by default and remembers the chevron per page group', async () => {
    renderLayout()
    const side = await rail()
    expect(within(side).getByText(sessionDetailFixture.manifest.title)).toBeInTheDocument()
    expect(within(side).queryByText('+2,556')).not.toBeInTheDocument()
    fireEvent.click(within(side).getByRole('button', { name: 'Expand session details' }))
    expect(within(side).getByText('+2,556')).toBeInTheDocument()
    expect(window.localStorage.getItem('review-dash:rail-density:files')).toBe('roomy')
    expect(window.localStorage.getItem('review-dash:rail-density:other')).toBeNull()
  })

  it('archives the session from the overflow menu, offers Undo and goes back to the list', async () => {
    const { api } = renderLayout()
    const banner = await header()
    const base = api.fetchMock.getMockImplementation()
    api.fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'POST' && urlOf(input).endsWith('/archive')) return json(200, { id: SESSION_ID })
      if (!base) return json(404, {})
      return base(input, init)
    })
    await archiveFromMenu(banner)
    await waitFor(() =>
      expect(api.fetchMock).toHaveBeenCalledWith(`/api/sessions/${SESSION_ID}/archive`, expect.objectContaining({ method: 'POST' })),
    )
    expect(await screen.findByText('Sessions list')).toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith('Session archived', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }))
  })

  it('stays on the session and toasts when archiving is refused (409 run-active)', async () => {
    const { api } = renderLayout()
    const banner = await header()
    const base = api.fetchMock.getMockImplementation()
    api.fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'POST' && urlOf(input).endsWith('/archive')) return json(409, { error: 'run-active' })
      if (!base) return json(404, {})
      return base(input, init)
    })
    await archiveFromMenu(banner)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Claude Code is still working on this session'))
    expect(screen.queryByText('Sessions list')).not.toBeInTheDocument()
    fireEvent.click(within(banner).getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Archive session' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('opens the grouped shortcut help from the header link and with Ctrl+?', async () => {
    renderLayout()
    fireEvent.click(await screen.findByRole('button', { name: 'Keyboard shortcuts' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Navigation')).toBeInTheDocument()
    expect(within(dialog).getByText('Video')).toBeInTheDocument()
    expect(within(dialog).getByText('Comment at the current time')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '?', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('reloads the detail on run.updated and session.updated (artifacts), ignoring other sessions', async () => {
    const { publish, detailGets, events } = renderLayout()
    await header()
    const before = detailGets()

    publish({ ...sessionDetailFixture, activeRunId: 'run-20260926180000-ab12' })
    events().emit('message', { type: 'run.updated', sessionId: SESSION_ID, runId: 'run-20260926180000-ab12' })
    await waitFor(() => expect(detailGets()).toBe(before + 1))

    publish({ ...sessionDetailFixture, extras: [...sessionDetailFixture.extras, { path: 'flow.mmd', type: 'mermaid', title: 'Flow' }] })
    events().emit('message', { type: 'session.updated', sessionId: SESSION_ID })
    await waitFor(() => expect(screen.getByRole('link', { name: /Extras/ })).toHaveTextContent('2'))
    expect(detailGets()).toBe(before + 2)

    events().emit('message', { type: 'run.updated', sessionId: 'other-session', runId: 'run-20260926180000-ab12' })
    events().emit('message', { type: 'session.updated', sessionId: 'other-session' })
    events().emit('message', { type: 'tree.updated', sessionId: 'other-session', fingerprint: fp('elsewhere'), durationMs: 5 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(detailGets()).toBe(before + 2)
  })

  it('on tree.updated refetches the detail, resets a verdict pinned to the old fingerprint, refetches the patch and toasts', async () => {
    const review = reviewFixture({ files: { [P0]: { verdict: 'approved', fingerprint: F0.fingerprint, viewed: true } } })
    const { api, publish, detailGets, events } = renderLayout({ review: reviewResponseFixture(review) })
    const side = await rail()
    const card = await screen.findByRole('article', { name: P0 })
    expect(card).toHaveAttribute('data-verdict', 'approved')
    expect(within(side).getByText('1/6')).toBeInTheDocument()
    await waitFor(() => expect(api.patchRequests).toHaveLength(1))
    const before = detailGets()

    // The same fingerprint as the tree on screen: nothing to fetch.
    events().emit('message', { type: 'tree.updated', sessionId: SESSION_ID, fingerprint: sessionDetailFixture.tree.fingerprint, durationMs: 40 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(detailGets()).toBe(before)

    const changed = withChangedFile(sessionDetailFixture, P0)
    publish(changed)
    events().emit('message', { type: 'tree.updated', sessionId: SESSION_ID, fingerprint: changed.tree.fingerprint, durationMs: 40 })
    await waitFor(() => expect(card).toHaveAttribute('data-verdict', 'none'))
    await waitFor(() => expect(detailGets()).toBe(before + 1))
    expect(within(card).getByText(/updated since sent/i)).toBeInTheDocument()
    expect(within(card).getByText('changed just now')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Approve' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(side).getByText('0/6')).toBeInTheDocument()
    // A judged file that changed on disk flips the session to Updated (plain label: no open comments).
    await waitFor(() => expect(api.patchRequests).toHaveLength(2))
    expect(toast.info).toHaveBeenCalledWith('1 file changed on disk', expect.objectContaining({ duration: expect.any(Number) }))
    // The review entry is kept (the stale verdict is simply not effective), nothing is written for it.
    expect(api.puts.some((put) => put.review.files[P0]?.verdict !== 'approved')).toBe(false)
  })

  it('drops a card whose file left the tree and counts appearing files in the toast', async () => {
    const { publish, events } = renderLayout()
    await screen.findByRole('article', { name: P0 })
    const [, ...rest] = sessionDetailFixture.tree.files
    const next: SessionDetail = {
      ...sessionDetailFixture,
      tree: { ...sessionDetailFixture.tree, fingerprint: fp('tree:v2'), files: [...rest, makeTreeFile({ path: 'src/new.ts', status: 'added' })] },
    }
    publish(next)
    events().emit('message', { type: 'tree.updated', sessionId: SESSION_ID, fingerprint: next.tree.fingerprint, durationMs: 40 })
    await waitFor(() => expect(screen.queryByRole('article', { name: P0 })).not.toBeInTheDocument())
    expect(await screen.findByRole('article', { name: rest[0]?.path ?? '' })).toBeInTheDocument()
    expect(toast.info).toHaveBeenCalledWith('2 files changed on disk', expect.anything())
  })

  it('shows a clear empty state when the detail cannot be built (repository missing)', async () => {
    renderLayout({
      detail: json(500, { error: 'repository not found', reason: '/Users/bojana/Projects/qbdvision is not a git checkout' }),
    })
    expect(await screen.findByRole('heading', { level: 1, name: "Couldn't load this session" })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('repository not found: /Users/bojana/Projects/qbdvision is not a git checkout')
    // The id is in the bar (with a Sessions link) and in the panel.
    expect(screen.getAllByText(SESSION_ID)).toHaveLength(2)
    expect(screen.getByRole('banner')).toHaveTextContent('Sessions')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('aria-labelledby', 'session-error-title')
    fireEvent.click(screen.getByRole('link', { name: 'Back to sessions' }))
    expect(await screen.findByText('Sessions list')).toBeInTheDocument()
  })

  it('names the missing repository on the 422 repo-missing answer', async () => {
    renderLayout({ detail: json(422, { error: 'repo-missing: /Users/bojana/Projects/gone' }) })
    expect(await screen.findByRole('heading', { level: 1, name: 'Repository missing' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('/Users/bojana/Projects/gone is gone or is no longer a git checkout.')
    expect(screen.queryByText('Loading session…')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
  })

  it('archives a session whose repository is gone and goes back to the list', async () => {
    const { api } = renderLayout({ detail: json(422, { error: 'repo-missing: /Users/bojana/Projects/worktrees/gone' }) })
    const base = api.fetchMock.getMockImplementation()
    api.fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'POST' && urlOf(input).endsWith('/archive')) return json(200, { id: SESSION_ID })
      return base ? base(input, init) : json(404, {})
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))
    await waitFor(() =>
      expect(api.fetchMock).toHaveBeenCalledWith(`/api/sessions/${SESSION_ID}/archive`, expect.objectContaining({ method: 'POST' })),
    )
    expect(await screen.findByText('Sessions list')).toBeInTheDocument()
  })

  it('names an archived session and offers Unarchive instead of a raw not-found', async () => {
    const { api } = renderLayout({ detail: json(404, { error: `session ${SESSION_ID} not found` }) })
    const base = api.fetchMock.getMockImplementation()
    api.fetchMock.mockImplementation(async (input, init) => {
      const url = urlOf(input)
      if (url.endsWith('/sessions/archived')) return json(200, [{ id: SESSION_ID, title: 'Trial countdown bar', tickets: [], repo: { path: '/r', branch: null, baseRef: null }, createdAt: '2026-09-26T16:53:00.000Z', updatedAt: '2026-09-26T16:53:00.000Z', archivedAt: '2026-09-27T09:00:00.000Z' }])
      if (init?.method === 'POST' && url.endsWith('/unarchive')) return json(200, { id: SESSION_ID })
      return base ? base(input, init) : json(404, {})
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Archived' }, { timeout: 3000 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }))
    await waitFor(() =>
      expect(api.fetchMock).toHaveBeenCalledWith(`/api/sessions/${SESSION_ID}/unarchive`, expect.objectContaining({ method: 'POST' })),
    )
  })
})
