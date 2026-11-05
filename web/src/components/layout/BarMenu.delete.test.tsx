import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_ID, testRunDetailFixture } from '@/test/fixtures'
import { renderShell } from '@/test/render-shell'
import { calls, json, stubApi } from '@/test/worktree-api'

vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())

/** Rendered as the page, so it disappears once the route leaves `/s/:id` or `/t/:id`. */
function Page() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

async function openMenu(bar: HTMLElement, itemName: string) {
  fireEvent.click(within(bar).getByRole('button', { name: 'More actions' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: itemName }))
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('BarMenu: delete session', () => {
  const archive = `POST /api/sessions/${SESSION_ID}/archive`
  const del = `DELETE /api/sessions/archived/${SESSION_ID}`

  it('opens the confirmation, deletes and goes back to the sessions list', async () => {
    const fetchMock = stubApi({ [archive]: () => json(200, { id: SESSION_ID }), [del]: () => json(200, { id: SESSION_ID }) })
    const { bar } = renderShell(`/s/${SESSION_ID}/files`, { page: <Page /> })
    expect(screen.getByTestId('location')).toHaveTextContent(`/s/${SESSION_ID}/files`)
    await openMenu(bar, 'Delete session…')
    expect(await screen.findByText('Delete this session permanently?')).toBeInTheDocument()
    expect(calls(fetchMock)).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Session deleted', expect.anything()))
    expect(calls(fetchMock)).toEqual([archive, del])
    // No route matches /d here: the session page is gone.
    await waitFor(() => expect(screen.queryByTestId('location')).not.toBeInTheDocument())
  })

  it('says "Delete test run…" for a test run and leaves for the test run list', async () => {
    const id = testRunDetailFixture.manifest.id
    const fetchMock = stubApi({ [`POST /api/sessions/${id}/archive`]: () => json(200, { id }), [`DELETE /api/sessions/archived/${id}`]: () => json(200, { id }) })
    const { bar } = renderShell(`/t/${SESSION_ID}/scenarios`, { kind: 'test-run', page: <Page /> })
    await openMenu(bar, 'Delete test run…')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(calls(fetchMock)).toEqual([`POST /api/sessions/${id}/archive`, `DELETE /api/sessions/archived/${id}`])
    await waitFor(() => expect(screen.queryByTestId('location')).not.toBeInTheDocument())
  })

  it('stays on the page and shows why when Claude is still working', async () => {
    const fetchMock = stubApi({ [archive]: () => json(409, { error: 'run-active' }), [del]: () => json(200, { id: SESSION_ID }) })
    const { bar } = renderShell(`/s/${SESSION_ID}/files`, { page: <Page /> })
    await openMenu(bar, 'Delete session…')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByText('Claude Code is still working on this session')).toBeInTheDocument()
    expect(screen.getByText('Delete this session permanently?')).toBeInTheDocument()
    expect(calls(fetchMock)).toEqual([archive])
    expect(screen.getByTestId('location')).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })
})
