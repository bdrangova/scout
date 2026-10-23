import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArchivedListState, SessionListState } from '@/lib/hooks'
import { sessionListFixture, testRunSummary } from '@/test/fixtures'
import { stubEventSource } from '@/test/mock-event-source'
import { ThemeProvider } from '@/theme'
import { SessionListPage } from './SessionListPage'
import { SESSION_LAYOUT_KEY } from '@/components/sessions/session-list-layout'
import { SCENARIO_STATUS_LABEL } from '@/lib/scenario-status'

const hooks = vi.hoisted(() => ({
  kinds: [] as (string | undefined)[],
  current: { sessions: null, loading: false, error: null, reload: () => {} } as SessionListState,
  archived: { archived: [], loading: false, error: null, reload: () => {} } as ArchivedListState,
}))

vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks')>()),
  useSessionList: (kind?: string) => {
    hooks.kinds.push(kind)
    return hooks.current
  },
  useArchivedSessions: () => hooks.archived,
}))

const RUN_A = testRunSummary({ id: '20261021-1100-run-a-aa11', title: 'Run A', updatedAt: '2026-10-21T11:00:00.000Z' })
const RUN_B = testRunSummary({ id: '20261020-1100-run-b-bb22', title: 'Run B', status: 'approved', reviewed: 3, updatedAt: '2026-10-20T11:00:00.000Z' })

function renderAt(path: string) {
  stubEventSource()
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<SessionListPage />} />
          <Route path="/pr" element={<SessionListPage kind="pr-review" />} />
          <Route path="/t" element={<SessionListPage kind="test-run" />} />
          <Route path="/t/:id" element={<p>Run route</p>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('SessionListPage kinds', () => {
  afterEach(() => {
    localStorage.removeItem(SESSION_LAYOUT_KEY)
    hooks.kinds.length = 0
    hooks.archived = { archived: [], loading: false, error: null, reload: () => {} }
    vi.unstubAllGlobals()
  })

  it('uses the saved grid for test runs, showing run metadata and every outcome', async () => {
    localStorage.setItem(SESSION_LAYOUT_KEY, 'grid')
    hooks.current = { sessions: [RUN_A], loading: false, error: null, reload: () => {} }
    renderAt('/t')
    const card = screen.getByRole('link', { name: 'Run A' })
    expect(card).toHaveAttribute('data-layout', 'grid')
    expect(within(card).getByTitle(RUN_A.run.path)).toBeInTheDocument()
    expect(within(card).queryByLabelText('Feature and area')).not.toBeInTheDocument()
    expect(within(card).queryByLabelText('Base and current branch')).not.toBeInTheDocument()
    for (const [status, label] of Object.entries(SCENARIO_STATUS_LABEL)) {
      const count = RUN_A.counts[status as keyof typeof SCENARIO_STATUS_LABEL]
      if (count > 0) expect(within(card).getByLabelText('Scenario counts')).toHaveTextContent(`${count} ${label}`)
    }
    await userEvent.setup().click(card)
    expect(screen.getByText('Run route')).toBeInTheDocument()
  })

  it.each(['list', 'grid'])('omits branches from archived test runs in %s layout', async (layout) => {
    localStorage.setItem(SESSION_LAYOUT_KEY, layout)
    hooks.current = { sessions: [], loading: false, error: null, reload: () => {} }
    hooks.archived = { archived: [{ id: RUN_A.id, title: 'Archived run', tickets: [], repo: { path: '/runs/run-a', branch: null, baseRef: null }, createdAt: RUN_A.updatedAt, updatedAt: RUN_A.updatedAt, archivedAt: RUN_A.updatedAt }], loading: false, error: null, reload: () => {} }
    renderAt('/t')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Archived · 1' }))
    const row = screen.getByRole('listitem', { name: 'Archived session Archived run' })
    expect(within(row).queryByLabelText('Base and current branch')).not.toBeInTheDocument()
    expect(within(row).queryByText('Not recorded')).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Restore Archived run' })).toBeInTheDocument()
  })

  it('asks for the code reviews on / and the test runs on /t', () => {
    hooks.current = { sessions: sessionListFixture, loading: false, error: null, reload: () => {} }
    const { unmount } = renderAt('/')
    expect(new Set(hooks.kinds)).toEqual(new Set(['code-review']))
    unmount()
    hooks.kinds.length = 0
    renderAt('/t')
    expect(new Set(hooks.kinds)).toEqual(new Set(['test-run']))
  })

  it('shows the Development | Test runs toggle with the current kind pressed, linking / and /t', () => {
    hooks.current = { sessions: [], loading: false, error: null, reload: () => {} }
    renderAt('/t')
    const toggle = screen.getByRole('group', { name: 'Session type' })
    expect(within(toggle).getByRole('link', { name: 'Test runs' })).toHaveAttribute('aria-current', 'true')
    expect(within(toggle).getByRole('link', { name: 'Test runs' })).toHaveAttribute('href', '/t')
    expect(within(toggle).getByRole('link', { name: 'Development' })).not.toHaveAttribute('aria-current')
    expect(within(toggle).getByRole('link', { name: 'Development' })).toHaveAttribute('href', '/')
  })

  it('titles the page "Test runs" and shows the empty state, not an error, when there is none', () => {
    hooks.current = { sessions: [], loading: false, error: null, reload: () => {} }
    renderAt('/t')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test runs')
    expect(screen.getByText('No test runs')).toBeInTheDocument()
    expect(screen.queryByText(/Couldn't load/)).not.toBeInTheDocument()
  })

  it('lists test run rows newest first on the status filters, and opens one', async () => {
    hooks.current = { sessions: [RUN_B, RUN_A], loading: false, error: null, reload: () => {} }
    renderAt('/t')
    const rows = screen.getAllByRole('link').filter((link) => link.hasAttribute('data-href'))
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['Run A', 'Run B'])
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Review status' }))
    await user.click(screen.getByRole('option', { name: 'Approved (1)' }))
    expect(screen.getAllByRole('link').filter((link) => link.hasAttribute('data-href'))).toHaveLength(1)
    await user.click(screen.getByRole('link', { name: 'Run B' }))
    expect(screen.getByText('Run route')).toBeInTheDocument()
  })

  it('switches between the lists with the T key', async () => {
    hooks.current = { sessions: [], loading: false, error: null, reload: () => {} }
    renderAt('/')
    const user = userEvent.setup()
    await user.keyboard('t')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test runs')
    await user.keyboard('t')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('PR review')
    await user.keyboard('t')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Development')
  })
})
