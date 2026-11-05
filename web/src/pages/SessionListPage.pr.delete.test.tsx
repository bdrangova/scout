import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assignedPr, assignedResponse, LIVE_ID, PENDING_ID } from '@/test/github-fixtures'
import { stubEventSource } from '@/test/mock-event-source'
import { calls, json, stubApi } from '@/test/worktree-api'
import { ThemeProvider } from '@/theme'
import { SessionListPage } from './SessionListPage'

vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())

function Probe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

function renderPage() {
  stubEventSource()
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/pr']}>
        <Probe />
        <Routes>
          <Route path="/pr" element={<SessionListPage kind="pr-review" />} />
          <Route path="/pr/p/:id" element={<p>Placeholder route</p>} />
          <Route path="/s/:id" element={<p>Session route</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

const ASSIGNED = 'GET /api/github/assigned'
const ARCHIVE = `POST /api/sessions/${LIVE_ID}/archive`
const DELETE = `DELETE /api/sessions/archived/${LIVE_ID}`
const BUTTON = 'Delete the session for Fix the trial bar'

function withSession(state: 'live' | 'archived' | 'pending', id = LIVE_ID) {
  return assignedPr({ session: { id, state }, status: 'in-progress' })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('PR reviews: delete session', () => {
  it('offers the button for live and archived sessions only', async () => {
    stubApi({
      [ASSIGNED]: () =>
        json(200, assignedResponse({
          assignedToMe: [
            withSession('live'),
            assignedPr({ url: 'https://github.com/acme/app/pull/20', number: 20, title: 'Archived one', session: { id: 'a-1', state: 'archived' }, status: 'approved' }),
            assignedPr({ url: 'https://github.com/acme/app/pull/21', number: 21, title: 'No session one' }),
            assignedPr({ url: 'https://github.com/acme/app/pull/22', number: 22, title: 'Pending one', session: { id: PENDING_ID, state: 'pending' } }),
          ],
        })),
    })
    renderPage()
    expect(await screen.findByRole('button', { name: BUTTON })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete the session for Archived one' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete the session for No session one' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete the session for Pending one' })).not.toBeInTheDocument()
  })

  it('confirms, archives then deletes, toasts and reloads the list, without opening the row', async () => {
    let deleted = false
    const fetchMock = stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [deleted ? assignedPr() : withSession('live')] })),
      [ARCHIVE]: () => json(200, { id: LIVE_ID }),
      [DELETE]: () => {
        deleted = true
        return json(200, { id: LIVE_ID })
      },
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: BUTTON }))
    expect(await screen.findByText('Delete this session permanently?')).toBeInTheDocument()
    expect(calls(fetchMock).filter((call) => call !== ASSIGNED)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Session deleted', { description: 'Fix the trial bar' }))
    expect(calls(fetchMock).filter((call) => call !== ASSIGNED)).toEqual([ARCHIVE, DELETE])
    await waitFor(() => expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument())
    expect(calls(fetchMock).filter((call) => call === ASSIGNED).length).toBeGreaterThan(1)
    expect(screen.getByTestId('location')).toHaveTextContent('/pr')
    expect(screen.queryByText('Session route')).not.toBeInTheDocument()
  })

  it('does nothing on cancel and does not open the row', async () => {
    const fetchMock = stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [withSession('live')] })) })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: BUTTON }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Delete this session permanently?')).not.toBeInTheDocument())
    expect(calls(fetchMock).filter((call) => call !== ASSIGNED)).toEqual([])
    expect(screen.getByTestId('location')).toHaveTextContent('/pr')
    expect(screen.queryByText('Session route')).not.toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('keeps the dialog open with the reason when Claude is still working', async () => {
    const fetchMock = stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [withSession('live')] })),
      [ARCHIVE]: () => json(409, { error: 'run-active' }),
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: BUTTON }))
    await user.click(await screen.findByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByText('Claude Code is still working on this session')).toBeInTheDocument()
    expect(screen.getByText('Delete this session permanently?')).toBeInTheDocument()
    expect(calls(fetchMock)).not.toContain(DELETE)
    expect(screen.getByTestId('location')).toHaveTextContent('/pr')
  })
})
