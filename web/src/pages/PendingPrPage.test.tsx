import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assignedPr, PENDING_ID, pendingReview } from '@/test/github-fixtures'
import { MockEventSource, stubEventSource } from '@/test/mock-event-source'
import { calls, json, stubApi } from '@/test/worktree-api'
import { ThemeProvider } from '@/theme'
import { PendingPrPage } from './PendingPrPage'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

function Probe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function renderPage() {
  stubEventSource()
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/pr/p/${PENDING_ID}`]}>
        <Probe />
        <Routes>
          <Route path="/pr/p/:id" element={<PendingPrPage />} />
          <Route path="/pr" element={<p>PR list route</p>} />
          <Route path="/s/:id" element={<p>Session route</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

const DETAIL = { ...pendingReview(), checkouts: ['/Users/me/Projects/app', '/Users/me/worktrees/app-2'] }
const COMMAND = `/publish-pr-review ${assignedPr().url}`
const DETAIL_ROUTE = `GET /api/pr-pending/${PENDING_ID}`

describe('PendingPrPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows the PR facts with a back link, the command and deep links right away', async () => {
    stubApi({ [DETAIL_ROUTE]: () => json(200, DETAIL) })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Fix the trial bar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /acme\/app#12/ })).toHaveAttribute('href', assignedPr().url)
    expect(screen.getByText('by octocat')).toBeInTheDocument()
    expect(screen.getByText('fix-trial-bar')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Active sessions/ })).toHaveAttribute('href', '/pr?tab=active')
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
    expect(screen.getByText('Open Claude Code in a checkout of acme/app, then run:')).toBeInTheDocument()
    expect(screen.getByText(COMMAND)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy command' })).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: 'Open in Claude Desktop' })
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      DETAIL.checkouts.map((path) => `claude://code/new?q=${encodeURIComponent(COMMAND)}&folder=${encodeURIComponent(path)}`),
    )
  })

  it('has no Desktop links without a local checkout', async () => {
    stubApi({ [DETAIL_ROUTE]: () => json(200, { ...DETAIL, checkouts: [] }) })
    renderPage()
    expect(await screen.findByText(COMMAND)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open in Claude Desktop' })).not.toBeInTheDocument()
  })

  it('removes the placeholder and returns to the active list', async () => {
    const fetchMock = stubApi({ [DETAIL_ROUTE]: () => json(200, DETAIL), [`DELETE /api/pr-pending/${PENDING_ID}`]: () => new Response(null, { status: 204 }) })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(calls(fetchMock)).toContain(`DELETE /api/pr-pending/${PENDING_ID}`))
    expect(await screen.findByText('PR list route')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/pr?tab=active')
  })

  it('redirects to the session when the placeholder was claimed (404 here, the session exists)', async () => {
    stubApi({ [`GET /api/sessions/${PENDING_ID}`]: () => json(200, {}) })
    renderPage()
    expect(await screen.findByText('Session route')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/s/${PENDING_ID}`)
  })

  it('says so when neither the placeholder nor a session exists', async () => {
    stubApi({})
    renderPage()
    expect(await screen.findByText("This PR review isn't here any more")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to active sessions' })).toHaveAttribute('href', '/pr?tab=active')
  })

  it('moves to the session when session.added arrives with its id', async () => {
    stubApi({ [DETAIL_ROUTE]: () => json(200, DETAIL) })
    renderPage()
    await screen.findByRole('heading', { name: 'Fix the trial bar' })
    MockEventSource.latest('/api/events')?.emit('message', { type: 'session.added', sessionId: '20260101-0000-other-aaaa' })
    expect(screen.getByRole('heading', { name: 'Fix the trial bar' })).toBeInTheDocument()
    MockEventSource.latest('/api/events')?.emit('message', { type: 'session.added', sessionId: PENDING_ID })
    expect(await screen.findByText('Session route')).toBeInTheDocument()
  })
})
