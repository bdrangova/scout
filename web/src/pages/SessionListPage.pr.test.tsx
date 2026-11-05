import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LocalPrReview } from '@scout/shared'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assignedPr, assignedResponse, LIVE_ID, PENDING_ID } from '@/test/github-fixtures'
import { MockEventSource, stubEventSource } from '@/test/mock-event-source'
import { calls, json, stubApi } from '@/test/worktree-api'
import { ThemeProvider } from '@/theme'
import { SessionListPage } from './SessionListPage'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

function Probe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
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
const URL_13 = 'https://github.com/acme/app/pull/13'
const NO_CONTENT = () => new Response(null, { status: 204 })

function local(overrides: Partial<LocalPrReview> = {}): LocalPrReview {
  return { session: { id: LIVE_ID, state: 'live' }, title: 'My own review', pr: null, status: 'in-progress', updatedAt: '2026-10-30T09:00:00.000Z', ...overrides }
}

/** The request body of the first call with this method and path. */
function bodyOf(fetchMock: ReturnType<typeof stubApi>, method: string, path: string): unknown {
  const call = fetchMock.mock.calls.find(([input, init]) => String(input) === path && init?.method === method)
  return JSON.parse(String(call?.[1]?.body))
}

function sectionTitles(): string[] {
  return screen.getAllByRole('region').map((region) => region.getAttribute('aria-label') ?? '')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('PR reviews: one list', () => {
  it('shows My PRs, Assigned to me, then the teams in order, each with its empty line', async () => {
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ teams: [{ id: 'backend', name: 'Backend', prs: [] }, { id: 'web', name: 'Web', prs: [] }] })) })
    renderPage()
    expect(await screen.findByRole('region', { name: 'My PRs' })).toBeInTheDocument()
    expect(sectionTitles()).toEqual(['My PRs', 'Assigned to me', 'Backend', 'Web', 'Other'])
    expect(within(screen.getByRole('region', { name: 'My PRs' })).getByText('No open PRs of yours')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Assigned to me' })).getByText('Nothing waiting for you')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Backend' })).getByText('Nothing assigned to Backend')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Other' })).getByText(/No other reviews/)).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('lists PRs with author, size and, in team sections only, who is assigned and who reviewed', async () => {
    const mine = assignedPr()
    const draft = assignedPr({ url: URL_13, number: 13, title: 'Draft idea', isDraft: true, author: 'hubot', requested: { users: [], teams: ['acme/backend'] } })
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [mine], teams: [{ id: 'backend', name: 'Backend', prs: [draft] }] })) })
    renderPage()
    const me = await screen.findByRole('region', { name: 'Assigned to me' })
    const link = within(me).getByRole('link', { name: 'Fix the trial bar' })
    expect(link).toHaveAttribute('href', mine.url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(me).toHaveTextContent('octocat')
    expect(me).toHaveTextContent('+120')
    expect(within(me).queryByLabelText('Assigned')).not.toBeInTheDocument()
    const backend = screen.getByRole('region', { name: 'Backend' })
    expect(within(backend).getByText('Draft')).toBeInTheDocument()
    expect(within(backend).getByLabelText('Assigned')).toHaveTextContent('backend')
  })

  it('searches every section, Other included', async () => {
    const other = assignedPr({ url: 'https://github.com/acme/app/pull/40', number: 40, title: 'Rename the grid', author: 'hubot' })
    stubApi({
      [ASSIGNED]: () =>
        json(200, assignedResponse({
          other: [local(), local({ session: { id: PENDING_ID, state: 'pending' }, title: 'Rename the sidebar', pr: { url: URL_13, repo: 'acme/app', number: 13 }, status: 'pending' })],
          assignedToMe: [assignedPr()],
          teams: [{ id: 'web', name: 'Web', prs: [other] }],
        })),
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Rename the grid')
    const search = screen.getByRole('searchbox', { name: 'Search PRs' })
    await user.type(search, 'rename')
    expect(screen.getByText('Rename the grid')).toBeInTheDocument()
    expect(screen.getByText('Rename the sidebar')).toBeInTheDocument()
    expect(screen.queryByText('Fix the trial bar')).not.toBeInTheDocument()
    expect(screen.queryByText('My own review')).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'hubot')
    expect(screen.queryByText('Rename the sidebar')).not.toBeInTheDocument()
    expect(screen.getByText('Rename the grid')).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, '#13')
    expect(screen.getByText('Rename the sidebar')).toBeInTheDocument()
    expect(screen.queryByText('Rename the grid')).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'zzz')
    expect(within(screen.getByRole('region', { name: 'Other' })).getByText('No PRs match your search.')).toBeInTheDocument()
  })

  it('switches each section between Open and Closed; the badge counts the shown view', async () => {
    stubApi({
      [ASSIGNED]: () =>
        json(200, assignedResponse({
          other: [local(), local({ session: { id: '20261030-0800-old-ef56', state: 'archived' }, title: 'Old review', status: 'archived' })],
          assignedToMe: [
            assignedPr(),
            assignedPr({ url: URL_13, number: 13, title: 'Second open', status: 'in-progress' }),
            assignedPr({ url: 'https://github.com/acme/app/pull/14', number: 14, title: 'Ignored one', status: 'ignored' }),
            // Approved stays open until the PR is merged.
            assignedPr({ url: 'https://github.com/acme/app/pull/15', number: 15, title: 'Approved one', status: 'approved' }),
          ],
        })),
    })
    const user = userEvent.setup()
    renderPage()
    const me = await screen.findByRole('region', { name: 'Assigned to me' })
    const badge = () => within(within(me).getByRole('button', { name: /Assigned to me/ })).getByText(/^\d+$/)
    expect(badge()).toHaveTextContent('3')
    expect(within(me).getByText('Second open')).toBeInTheDocument()
    expect(within(me).getByText('Approved one')).toBeInTheDocument()
    expect(within(me).queryByText('Ignored one')).not.toBeInTheDocument()
    await user.click(within(me).getByRole('button', { name: 'Closed' }))
    expect(badge()).toHaveTextContent('1')
    expect(within(me).getByText('Ignored one')).toBeInTheDocument()
    expect(within(me).queryByText('Second open')).not.toBeInTheDocument()
    // The other section keeps its own view.
    const mineSection = screen.getByRole('region', { name: 'Other' })
    expect(within(mineSection).getByText('My own review')).toBeInTheDocument()
    await user.click(within(mineSection).getByRole('button', { name: 'Closed' }))
    expect(within(mineSection).getByText('Old review')).toBeInTheDocument()
    await user.click(within(me).getByRole('button', { name: 'Open' }))
    expect(within(me).getByText('Second open')).toBeInTheDocument()
  })

  it('says "Nothing closed yet" on an empty Closed view', async () => {
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [assignedPr()] })) })
    const user = userEvent.setup()
    renderPage()
    const me = await screen.findByRole('region', { name: 'Assigned to me' })
    await user.click(within(me).getByRole('button', { name: 'Closed' }))
    expect(within(me).getByText('Nothing closed yet')).toBeInTheDocument()
  })

  it('collapses a section from its caret and expands it again', async () => {
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [assignedPr()] })) })
    const user = userEvent.setup()
    renderPage()
    const me = await screen.findByRole('region', { name: 'Assigned to me' })
    const caret = within(me).getByRole('button', { name: /Assigned to me/ })
    expect(caret).toHaveAttribute('aria-expanded', 'true')
    await user.click(caret)
    expect(caret).toHaveAttribute('aria-expanded', 'false')
    expect(within(me).queryByText('Fix the trial bar')).not.toBeInTheDocument()
    expect(within(me).queryByRole('button', { name: 'Closed' })).not.toBeInTheDocument()
    await user.click(caret)
    expect(within(me).getByText('Fix the trial bar')).toBeInTheDocument()
  })
})

describe('PR reviews: opening a row', () => {
  it('opens the live session when the row of a PR with one is clicked', async () => {
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [assignedPr({ session: { id: LIVE_ID, state: 'live' }, status: 'in-progress' })] })) })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('link', { name: 'Open the review of Fix the trial bar' }))
    expect(await screen.findByText('Session route')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/s/${LIVE_ID}`)
  })

  it('opens the placeholder page for a not-started review', async () => {
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [assignedPr({ session: { id: PENDING_ID, state: 'pending' } })] })) })
    const user = userEvent.setup()
    renderPage()
    const row = await screen.findByRole('link', { name: 'Open the review of Fix the trial bar' })
    expect(row).toHaveTextContent('Not started')
    await user.click(row)
    expect(await screen.findByText('Placeholder route')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/pr/p/${PENDING_ID}`)
  })

  it('starts a review for an open PR without a session: creates the placeholder, copies the command, navigates', async () => {
    const pr = assignedPr()
    const fetchMock = stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [pr] })),
      'POST /api/pr-pending': () => json(200, { id: PENDING_ID, state: 'pending' }),
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('link', { name: 'Start a review of Fix the trial bar' }))
    expect(await screen.findByText('Placeholder route')).toBeInTheDocument()
    expect(bodyOf(fetchMock, 'POST', '/api/pr-pending')).toEqual({ url: pr.url })
    expect(screen.getByTestId('location')).toHaveTextContent(`/pr/p/${PENDING_ID}`)
    expect(await navigator.clipboard.readText()).toBe(`/scout-pr-review ${pr.url}`)
  })

  it('goes to the live session when starting finds one already', async () => {
    stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [assignedPr()] })),
      'POST /api/pr-pending': () => json(200, { id: LIVE_ID, state: 'live' }),
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('link', { name: /Start a review of/ }))
    expect(await screen.findByText('Session route')).toBeInTheDocument()
  })

  it('does not make a closed PR without a session clickable', async () => {
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [assignedPr({ status: 'ignored' })] })) })
    const user = userEvent.setup()
    renderPage()
    const me = await screen.findByRole('region', { name: 'Assigned to me' })
    await user.click(within(me).getByRole('button', { name: 'Closed' }))
    expect(within(me).queryByRole('link', { name: /review of/ })).not.toBeInTheDocument()
    expect(within(me).getByText('Fix the trial bar')).toBeInTheDocument()
  })
})

describe('PR reviews: row actions', () => {
  it('ignores an open PR and reloads the list', async () => {
    const pr = assignedPr()
    let ignored = false
    const fetchMock = stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [{ ...pr, status: ignored ? 'ignored' : 'pending' }] })),
      'PUT /api/github/ignored': () => {
        ignored = true
        return NO_CONTENT()
      },
    })
    const user = userEvent.setup()
    renderPage()
    const me = await screen.findByRole('region', { name: 'Assigned to me' })
    await user.click(await within(me).findByRole('button', { name: 'Ignore Fix the trial bar' }))
    await waitFor(() => expect(within(me).getByText('Nothing waiting for you')).toBeInTheDocument())
    expect(bodyOf(fetchMock, 'PUT', '/api/github/ignored')).toEqual({ url: pr.url })
    expect(calls(fetchMock).filter((call) => call === ASSIGNED)).toHaveLength(2)
    // The click did not also start a review.
    expect(calls(fetchMock)).not.toContain('POST /api/pr-pending')
    await user.click(within(me).getByRole('button', { name: 'Closed' }))
    expect(within(me).getByText('Fix the trial bar')).toBeInTheDocument()
  })

  it('has no Done button on an open PR, and tags a PR you approved', async () => {
    const approved = assignedPr({ title: 'I approved this', reviews: [{ login: 'Bojana', state: 'approved', submittedAt: '2026-10-30T09:00:00.000Z' }], requested: { users: [], teams: ['acme/backend'] } })
    const other = assignedPr({ url: URL_13, number: 13, title: 'Others approved', reviews: [{ login: 'reviewer-1', state: 'approved', submittedAt: '2026-10-30T09:00:00.000Z' }] })
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [other], teams: [{ id: 'backend', name: 'Backend', prs: [approved] }] })) })
    renderPage()
    const team = await screen.findByRole('region', { name: 'Backend' })
    expect(within(team).getByText('You approved')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Assigned to me' })).queryByText('You approved')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /as done/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Ignore / })).toHaveLength(2)
  })

  it('reopens a closed PR and reloads the list', async () => {
    const pr = assignedPr()
    let reopened = false
    const fetchMock = stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [{ ...pr, status: reopened ? 'pending' : 'done' }] })),
      'POST /api/github/reopen': () => {
        reopened = true
        return NO_CONTENT()
      },
    })
    const user = userEvent.setup()
    renderPage()
    const me = await screen.findByRole('region', { name: 'Assigned to me' })
    await user.click(within(me).getByRole('button', { name: 'Closed' }))
    expect(within(me).queryByRole('button', { name: /Ignore/ })).not.toBeInTheDocument()
    await user.click(within(me).getByRole('button', { name: 'Reopen Fix the trial bar' }))
    await waitFor(() => expect(within(me).getByText('Nothing closed yet')).toBeInTheDocument())
    expect(bodyOf(fetchMock, 'POST', '/api/github/reopen')).toEqual({ url: pr.url })
    await user.click(within(me).getByRole('button', { name: 'Open' }))
    expect(within(me).getByText('Fix the trial bar')).toBeInTheDocument()
  })

  it('sets the status of a live review from its status menu, without opening the row', async () => {
    const fetchMock = stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [assignedPr({ session: { id: LIVE_ID, state: 'live' }, status: 'in-progress' })] })),
      [`PUT /api/sessions/${LIVE_ID}/pr-status`]: NO_CONTENT,
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Review status of Fix the trial bar/ }))
    await user.click(await screen.findByRole('menuitem', { name: /Commented/ }))
    await waitFor(() => expect(calls(fetchMock)).toContain(`PUT /api/sessions/${LIVE_ID}/pr-status`))
    expect(bodyOf(fetchMock, 'PUT', `/api/sessions/${LIVE_ID}/pr-status`)).toEqual({ status: 'commented' })
    expect(screen.queryByText('Session route')).not.toBeInTheDocument()
  })

  it('shows a plain status label, not a menu, for a PR without a live session', async () => {
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ assignedToMe: [assignedPr()] })) })
    renderPage()
    const me = await screen.findByRole('region', { name: 'Assigned to me' })
    expect(within(me).getByRole('status', { name: 'Pending' })).toBeInTheDocument()
    expect(within(me).queryByRole('button', { name: /Review status of/ })).not.toBeInTheDocument()
  })
})

describe('PR reviews: Other and My PRs', () => {
  it('lists local reviews: Local tag without a PR, a PR link with one, and opens them', async () => {
    stubApi({
      [ASSIGNED]: () =>
        json(200, assignedResponse({
          other: [
            local(),
            local({ session: { id: PENDING_ID, state: 'pending' }, title: 'Elsewhere PR', pr: { url: 'https://github.com/other/repo/pull/7', repo: 'other/repo', number: 7 }, status: 'pending' }),
          ],
        })),
    })
    const user = userEvent.setup()
    renderPage()
    const mine = await screen.findByRole('region', { name: 'Other' })
    const own = within(mine).getByRole('link', { name: 'Open the review of My own review' })
    expect(own).toHaveTextContent('Local')
    const elsewhere = within(mine).getByRole('link', { name: 'Open the review of Elsewhere PR' })
    // With a PR the title links to GitHub (and does not open the row); the repo and number are plain text.
    const title = within(elsewhere).getByRole('link', { name: 'Elsewhere PR' })
    expect(title).toHaveAttribute('href', 'https://github.com/other/repo/pull/7')
    expect(title).toHaveAttribute('target', '_blank')
    expect(elsewhere).toHaveTextContent('other/repo #7')
    expect(within(elsewhere).getAllByRole('link')).toHaveLength(1)
    expect(within(own).queryByRole('link')).not.toBeInTheDocument()
    await user.click(title)
    expect(screen.queryByText('Placeholder route')).not.toBeInTheDocument()
    expect(elsewhere).toHaveTextContent('Not started')
    await user.click(own)
    expect(await screen.findByText('Session route')).toBeInTheDocument()
  })

  it('archives a live review without a PR', async () => {
    let archived = false
    const fetchMock = stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ other: archived ? [] : [local()] })),
      [`POST /api/sessions/${LIVE_ID}/archive`]: () => {
        archived = true
        return json(200, { id: LIVE_ID })
      },
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Archive My own review' }))
    await waitFor(() => expect(calls(fetchMock)).toContain(`POST /api/sessions/${LIVE_ID}/archive`))
    await waitFor(() => expect(screen.queryByText('My own review')).not.toBeInTheDocument())
  })

  it('removes a not-started review without a PR', async () => {
    let gone = false
    const fetchMock = stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ other: gone ? [] : [local({ session: { id: PENDING_ID, state: 'pending' }, status: 'pending' })] })),
      [`DELETE /api/pr-pending/${PENDING_ID}`]: () => {
        gone = true
        return NO_CONTENT()
      },
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove My own review' }))
    await waitFor(() => expect(calls(fetchMock)).toContain(`DELETE /api/pr-pending/${PENDING_ID}`))
    await waitFor(() => expect(screen.queryByText('My own review')).not.toBeInTheDocument())
  })

  it('reopens an archived review without a PR from the Closed view', async () => {
    const id = '20261030-0800-old-ef56'
    let restored = false
    const fetchMock = stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ other: [local({ session: { id, state: 'archived' }, status: restored ? 'in-progress' : 'archived' })] })),
      [`POST /api/sessions/${id}/unarchive`]: () => {
        restored = true
        return json(200, { id })
      },
    })
    const user = userEvent.setup()
    renderPage()
    const mine = await screen.findByRole('region', { name: 'Other' })
    await user.click(within(mine).getByRole('button', { name: 'Closed' }))
    // An archived review is not clickable until it is restored.
    expect(within(mine).queryByRole('link', { name: /Open the review/ })).not.toBeInTheDocument()
    await user.click(within(mine).getByRole('button', { name: 'Reopen My own review' }))
    await waitFor(() => expect(calls(fetchMock)).toContain(`POST /api/sessions/${id}/unarchive`))
    await waitFor(() => expect(within(mine).getByText('Nothing closed yet')).toBeInTheDocument())
  })

  it('gives a local row with a PR the PR actions: Ignore and, when closed, Reopen', async () => {
    const pr = { url: URL_13, repo: 'acme/app', number: 13 }
    const fetchMock = stubApi({
      [ASSIGNED]: () =>
        json(200, assignedResponse({
          other: [local({ pr, status: 'in-progress' }), local({ session: { id: '20261030-0800-old-ef56', state: 'archived' }, title: 'Done review', pr, status: 'done' })],
        })),
      'PUT /api/github/ignored': NO_CONTENT,
      'POST /api/github/reopen': NO_CONTENT,
    })
    const user = userEvent.setup()
    renderPage()
    const mine = await screen.findByRole('region', { name: 'Other' })
    expect(within(mine).queryByRole('button', { name: /^Archive/ })).not.toBeInTheDocument()
    await user.click(within(mine).getByRole('button', { name: 'Ignore My own review' }))
    await waitFor(() => expect(bodyOf(fetchMock, 'PUT', '/api/github/ignored')).toEqual({ url: pr.url }))
    await user.click(within(mine).getByRole('button', { name: 'Closed' }))
    await user.click(within(mine).getByRole('button', { name: 'Reopen Done review' }))
    await waitFor(() => expect(bodyOf(fetchMock, 'POST', '/api/github/reopen')).toEqual({ url: pr.url }))
  })

  it('lists authored PRs in My PRs with reviewers, and local reviews in Other', async () => {
    const own = assignedPr({ url: URL_13, number: 13, title: 'My authored PR', author: 'bojana', updatedAt: '2026-10-30T09:30:00.000Z', requested: { users: ['rev-1'], teams: [] }, session: { id: LIVE_ID, state: 'live' }, status: 'in-progress' })
    const older = assignedPr({ url: 'https://github.com/acme/app/pull/15', number: 15, title: 'Older authored', author: 'bojana', updatedAt: '2026-10-30T08:00:00.000Z' })
    stubApi({
      [ASSIGNED]: () =>
        json(200, assignedResponse({
          authored: [own, older],
          other: [local({ title: 'Newest local', updatedAt: '2026-10-30T10:00:00.000Z' }), local({ session: { id: PENDING_ID, state: 'pending' }, title: 'Oldest local', updatedAt: '2026-10-30T07:00:00.000Z', status: 'pending' })],
        })),
    })
    const user = userEvent.setup()
    renderPage()
    const mine = await screen.findByRole('region', { name: 'My PRs' })
    const other = screen.getByRole('region', { name: 'Other' })
    const names = (region: HTMLElement) => within(region).getAllByRole('link', { name: /^(Open the review of|Start a review of) / }).map((row) => row.getAttribute('aria-label'))
    expect(names(mine)).toEqual(['Open the review of My authored PR', 'Start a review of Older authored'])
    expect(names(other)).toEqual(['Open the review of Newest local', 'Open the review of Oldest local'])
    expect(within(within(mine).getByRole('link', { name: 'Open the review of My authored PR' })).getByLabelText('Assigned')).toHaveTextContent('rev-1')
    expect(within(mine).getByRole('button', { name: /My PRs/ })).toHaveTextContent('2')
    expect(within(other).getByRole('button', { name: /Other/ })).toHaveTextContent('2')
    await user.type(screen.getByRole('searchbox', { name: 'Search PRs' }), 'authored')
    expect(within(other).queryByText('Newest local')).not.toBeInTheDocument()
    expect(within(mine).getByText('Older authored')).toBeInTheDocument()
  })

  it('reloads when a session is added or a placeholder changes', async () => {
    const fetchMock = stubApi({ [ASSIGNED]: () => json(200, assignedResponse()) })
    renderPage()
    await screen.findByRole('region', { name: 'My PRs' })
    MockEventSource.latest('/api/events')?.emit('message', { type: 'pr-pending.updated' })
    await waitFor(() => expect(calls(fetchMock).filter((call) => call === ASSIGNED)).toHaveLength(2))
  })
})

describe('PR reviews: problems, errors and refresh', () => {
  it.each([
    ['gh-missing', 'Install the GitHub CLI (gh) on this Mac'],
    ['not-authenticated', 'Sign in to GitHub'],
  ] as const)('explains the %s problem above Other, which still lists the reviews', async (problem, title) => {
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ problem, other: [local()] })) })
    renderPage()
    expect(await screen.findByText(title)).toBeInTheDocument()
    if (problem === 'not-authenticated') expect(screen.getByText('gh auth login')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Other' })).getByText('My own review')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Assigned to me' })).not.toBeInTheDocument()
  })

  it('opens Settings at the GitHub section when no repositories are followed, and Other still lists', async () => {
    stubApi({
      [ASSIGNED]: () => json(200, assignedResponse({ problem: 'no-repos', other: [local()] })),
      'GET /api/settings': () => json(200, { worktreeFolders: [], github: { repos: [], teams: [] } }),
    })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('No repositories followed yet')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Other' })).getByText('My own review')).toBeInTheDocument()
    expect(sectionTitles()).toEqual(['Other'])
    await user.click(screen.getByRole('button', { name: 'Add repositories' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    expect(await within(dialog).findByRole('region', { name: 'Followed repositories' })).toBeInTheDocument()
  })

  it('shows per-repo failures as a notice next to the sections', async () => {
    stubApi({ [ASSIGNED]: () => json(200, assignedResponse({ errors: [{ repo: 'acme/gone', error: 'Not Found' }] })) })
    renderPage()
    expect(await screen.findByText("Couldn't load acme/gone: Not Found")).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Assigned to me' })).toBeInTheDocument()
  })

  it('refreshes past the cache and refetches when the window regains focus', async () => {
    const fetchMock = stubApi({ [ASSIGNED]: () => json(200, assignedResponse()), 'GET /api/github/assigned?refresh=1': () => json(200, assignedResponse()) })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/Fetched/)
    await user.click(screen.getByRole('button', { name: 'Refresh PRs' }))
    await waitFor(() => expect(calls(fetchMock)).toContain('GET /api/github/assigned?refresh=1'))
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(calls(fetchMock).filter((call) => call === ASSIGNED)).toHaveLength(2))
  })
})
