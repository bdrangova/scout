import type { SessionDetail } from '@scout/shared'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { ExtrasPage } from './ExtrasPage'

vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ initialize() {}, render: async () => ({ svg: '' }) }) },
}))

const CONTENTS: Record<string, string> = {
  'extras/architecture.md': '# Architecture\n\nThe bar is rendered by `app.ts`.',
  'extras/reports/report.html': '<html><body><h1>Report</h1></body></html>',
}

const detail: SessionDetail = {
  ...sessionDetailFixture,
  extras: [
    { path: 'architecture.md', type: 'markdown', title: 'Architecture' },
    { path: 'reports/report.html', type: 'html', title: 'Test report' },
  ],
}

function renderExtras(review = reviewFixture(), path = '/') {
  const api = mockReviewApi(reviewResponseFixture(review), { contents: CONTENTS })
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>
        <ReviewProvider>
          <ExtrasPage />
        </ReviewProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
  return api
}

describe('ExtrasPage', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('renders one card per extra from /extras/<path>, with its comments keyed by path', async () => {
    const api = renderExtras(
      reviewFixture({ comments: [commentFixture('c1', { kind: 'extra', ref: 'architecture.md' }, 'Missing the provider node.')], nextCommentId: 2 }),
    )
    expect(await screen.findByRole('group', { name: '2 items · 1 open comment' })).toBeInTheDocument()

    const architecture = screen.getByRole('article', { name: 'Architecture' })
    expect(within(architecture).getByLabelText('Markdown')).toBeInTheDocument()
    expect(await within(architecture).findByRole('heading', { level: 1, name: 'Architecture' })).toBeInTheDocument()
    expect(await within(architecture).findByText('Missing the provider node.')).toBeInTheDocument()
    // Comment boxes start folded; the row carries the label until it is opened.
    expect(within(architecture).getByRole('button', { name: 'Comment on Architecture' })).toBeInTheDocument()

    const report = screen.getByRole('article', { name: 'Test report' })
    expect(within(report).getByLabelText('HTML')).toBeInTheDocument()
    expect(within(report).getByText('report.html')).toHaveAttribute('title', 'reports/report.html')
    const frame = await within(report).findByTitle('Test report')
    expect(frame.getAttribute('srcdoc')).toContain('<h1>Report</h1>')
    expect(api.fetchMock.mock.calls.map((call) => String(call[0]))).toContain(`/api/sessions/${SESSION_ID}/extras/reports/report.html`)

    const user = userEvent.setup()
    await user.click(within(report).getByRole('button', { name: 'Comment on Test report' }))
    expect(within(report).getByRole('textbox', { name: 'Comment on Test report' })).toHaveAttribute('placeholder', 'Leave a comment…')
    await user.type(within(report).getByRole('textbox', { name: 'Comment on Test report' }), 'Two cases are skipped.')
    await user.click(within(report).getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(api.puts.at(-1)?.review.comments.at(-1)?.target).toEqual({ kind: 'extra', ref: 'reports/report.html' }), { timeout: 1500 })
  })

  it('folds a card from its chevron or its title', async () => {
    renderExtras()
    const architecture = await screen.findByRole('article', { name: 'Architecture' })
    expect(await within(architecture).findByRole('heading', { level: 1, name: 'Architecture' })).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(within(architecture).getByRole('button', { name: 'Collapse Architecture' }))
    expect(within(architecture).queryByRole('heading', { level: 1, name: 'Architecture' })).not.toBeInTheDocument()
    await user.click(within(architecture).getByRole('heading', { level: 2, name: 'Architecture' }).querySelector('button')!)
    expect(within(architecture).getByRole('button', { name: 'Collapse Architecture' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(architecture).getByRole('heading', { level: 1, name: 'Architecture' })).toBeInTheDocument()
  })

  it('shows a tile per extra in the grid view, and a tile opens the cards', async () => {
    renderExtras(reviewFixture({ comments: [commentFixture('c1', { kind: 'extra', ref: 'architecture.md' }, 'Missing the provider node.')], nextCommentId: 2 }), '/?mode=grid')
    const grid = await screen.findByRole('list', { name: 'All extras' })
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    const tiles = within(grid).getAllByRole('listitem')
    expect(tiles).toHaveLength(2)
    expect(tiles[0]).toHaveTextContent('Markdown')
    expect(tiles[0]).toHaveTextContent('architecture.md')
    expect(await within(tiles[0]!).findByText('1 open comment')).toBeInTheDocument()
    expect(tiles[1]).toHaveTextContent('HTML')
    expect(tiles[1]).toHaveTextContent('No open comments')

    await userEvent.setup().click(within(grid).getByRole('button', { name: 'Open Test report' }))
    expect(await screen.findByRole('article', { name: 'Test report' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'All extras' })).not.toBeInTheDocument()
  })

  it('shows the empty state when the extras folder has nothing', async () => {
    mockReviewApi(reviewResponseFixture(reviewFixture()), { contents: CONTENTS })
    render(
      <MemoryRouter>
        <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: { ...detail, extras: [] }, reload: () => {} }}>
          <ReviewProvider>
            <ExtrasPage />
          </ReviewProvider>
        </SessionContext.Provider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Extras' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No extras')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('shows the error with a Retry button when a file fails to load, and reloads it on Retry', async () => {
    const api = mockReviewApi(reviewResponseFixture(reviewFixture()), { contents: CONTENTS })
    const base = api.fetchMock.getMockImplementation()
    let failed = false
    api.fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (!failed && String(input).endsWith('/extras/architecture.md')) {
        failed = true
        return Promise.resolve(new Response('disk gone', { status: 500 }))
      }
      return base ? base(input, init) : Promise.reject(new Error('no base'))
    })
    render(
      <MemoryRouter>
        <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>
          <ReviewProvider>
            <ExtrasPage />
          </ReviewProvider>
        </SessionContext.Provider>
      </MemoryRouter>,
    )
    const architecture = await screen.findByRole('article', { name: 'Architecture' })
    expect(await within(architecture).findByRole('alert')).toHaveTextContent(/Couldn't load this file/)
    await userEvent.setup().click(within(architecture).getByRole('button', { name: 'Retry' }))
    expect(await within(architecture).findByRole('heading', { level: 1, name: 'Architecture' })).toBeInTheDocument()
    expect(within(architecture).queryByRole('alert')).not.toBeInTheDocument()
  })
})
