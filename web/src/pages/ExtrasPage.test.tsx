import type { SessionDetail } from '@review-dash/shared'
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

function renderExtras(review = reviewFixture()) {
  const api = mockReviewApi(reviewResponseFixture(review), { contents: CONTENTS })
  render(
    <MemoryRouter>
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
    expect(await screen.findByText('2 items · 1 open comment')).toBeInTheDocument()

    const architecture = screen.getByRole('article', { name: 'Architecture' })
    expect(within(architecture).getByText('Markdown')).toBeInTheDocument()
    expect(await within(architecture).findByRole('heading', { level: 1, name: 'Architecture' })).toBeInTheDocument()
    expect(await within(architecture).findByText('Missing the provider node.')).toBeInTheDocument()
    // Comment boxes start folded; the row carries the label until it is opened.
    expect(within(architecture).getByRole('button', { name: 'Comment on Architecture' })).toBeInTheDocument()

    const report = screen.getByRole('article', { name: 'Test report' })
    expect(within(report).getByText('HTML')).toBeInTheDocument()
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
})
