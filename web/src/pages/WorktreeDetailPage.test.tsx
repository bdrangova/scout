import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SESSION_LAYOUT_KEY } from '@/components/sessions/session-list-layout'
import { sessionSummary, testRunSummary, worktreeSummary } from '@/test/fixtures'
import { calls, json, stubApi } from '@/test/worktree-api'
import { ThemeProvider } from '@/theme'
import { WorktreeDetailPage } from './WorktreeDetailPage'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

const ID = 'aaaaaaaaaaaa'
const BASE = worktreeSummary({ id: ID, name: 'trial-bar' })
const PATH = BASE.path

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/w/${ID}`]}>
        <Routes>
          <Route path="/" element={<p>Worktree list route</p>} />
          <Route path="/w/:id" element={<WorktreeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('WorktreeDetailPage', () => {
  afterEach(() => {
    localStorage.removeItem(SESSION_LAYOUT_KEY)
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('shows the worktree, three copy-only start panels and an empty sessions note', async () => {
    const fetchMock = stubApi({ [`GET /api/worktrees/${ID}`]: () => json(200, { ...BASE, linkedSessions: [] }) })
    renderPage()
    const user = userEvent.setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'trial-bar' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Worktrees' })).toHaveAttribute('href', '/')
    expect(screen.getByText('QI-15472')).toBeInTheDocument()
    expect(screen.getByText('3 ahead · 1 behind')).toBeInTheDocument()
    expect(screen.getByText('No sessions for this worktree yet.')).toBeInTheDocument()
    const commands = { Development: '/scout-development-review', 'PR review': '/scout-pr-review <PR-URL>', 'Test run': '/scout-test-run <run-folder>' }
    for (const [title, command] of Object.entries(commands)) {
      const panel = screen.getByRole('group', { name: title })
      expect(within(panel).getByText('Open a new Claude Code session in the folder above, then run:')).toBeInTheDocument()
      expect(within(panel).queryByText(PATH)).not.toBeInTheDocument()
      expect(within(panel).getByText(command)).toBeInTheDocument()
    }
    const test = screen.getByRole('group', { name: 'Test run' })
    await user.click(within(test).getByRole('button', { name: 'Copy command' }))
    expect(await navigator.clipboard.readText()).toBe('/scout-test-run <run-folder>')
    await user.click(screen.getByRole('button', { name: 'Copy path' }))
    expect(await navigator.clipboard.readText()).toBe(PATH)
    expect(calls(fetchMock)).toEqual([`GET /api/worktrees/${ID}`])
  })

  it('lists the linked sessions as the session cards and archives one', async () => {
    let archived = false
    const run = testRunSummary({ id: 'run-1', title: 'Trial run' })
    const review = sessionSummary({ id: 's1', title: 'Trial countdown bar' })
    const fetchMock = stubApi({
      [`GET /api/worktrees/${ID}`]: () => json(200, { ...BASE, sessions: { 'code-review': 1, 'pr-review': 0, 'test-run': 1 }, linkedSessions: archived ? [run] : [review, run] }),
      'POST /api/sessions/s1/archive': () => {
        archived = true
        return json(200, { id: 's1' })
      },
    })
    renderPage()
    const user = userEvent.setup()
    const card = await screen.findByRole('link', { name: 'Trial countdown bar' })
    expect(card).toHaveAttribute('data-href', '/s/s1')
    expect(screen.getByRole('link', { name: 'Trial run' })).toHaveAttribute('data-href', '/t/run-1')
    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    await user.click(screen.getByRole('button', { name: 'Archive Trial countdown bar' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Trial countdown bar' })).not.toBeInTheDocument())
    expect(calls(fetchMock)).toContain('POST /api/sessions/s1/archive')
    expect(screen.getByRole('link', { name: 'Trial run' })).toBeInTheDocument()
  })

  it('deletes the worktree and goes back to the list', async () => {
    stubApi({
      [`GET /api/worktrees/${ID}`]: () => json(200, { ...BASE, linkedSessions: [] }),
      [`DELETE /api/worktrees/${ID}`]: () => new Response(null, { status: 204 }),
    })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete worktree' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Delete worktree?' })).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Worktree list route')).toBeInTheDocument()
  })

  it('shows a git refusal in the delete dialog', async () => {
    stubApi({
      [`GET /api/worktrees/${ID}`]: () => json(200, { ...BASE, linkedSessions: [] }),
      [`DELETE /api/worktrees/${ID}`]: () => json(409, { error: 'git refused: worktree is locked', reason: 'git' }),
    })
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete worktree' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('git refused: worktree is locked')
  })
})
