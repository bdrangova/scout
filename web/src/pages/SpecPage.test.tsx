import type { SessionDetail } from '@scout/shared'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { SpecPage } from './SpecPage'

vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ initialize() {}, render: async () => ({ svg: '' }) }) },
}))

const CONTENTS: Record<string, string> = {
  'spec/jira.md': '# QI-15472: Trial bar\n\n## Acceptance criteria\n\n1. Shows the days left.',
  'spec/plan.md': '# Plan\n\n- Hook first\n- Then the component',
  'spec/design.html': '<!doctype html><html><head><title>Design</title></head><body><h1>Trial bar states</h1></body></html>',
}

const detail: SessionDetail = {
  ...sessionDetailFixture,
  spec: [
    { path: 'jira.md', type: 'jira', title: 'QI-15472: Trial bar', url: 'https://example.atlassian.net/browse/QI-15472', sourcePath: null, capturedAt: null },
    { path: 'plan.md', type: 'markdown', title: 'Implementation plan', url: null, sourcePath: '/Users/alex/.claude/plans/trial-bar.md', capturedAt: null },
    { path: 'design.html', type: 'artifact', title: 'Trial bar design', url: 'https://claude.ai/artifact/example', sourcePath: null, capturedAt: null },
  ],
}

function renderSpec(review = reviewFixture()) {
  const api = mockReviewApi(reviewResponseFixture(review), { contents: CONTENTS })
  render(
    <MemoryRouter>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>
        <ReviewProvider>
          <SpecPage />
        </ReviewProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
  return api
}

describe('SpecPage', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('folds a card from its header chevron and unfolds it again', async () => {
    renderSpec()
    const jira = await screen.findByRole('article', { name: 'Jira spec' })
    expect(await within(jira).findByRole('heading', { level: 2, name: 'Acceptance criteria' })).toBeInTheDocument()
    const toggle = within(jira).getByRole('button', { name: 'Collapse QI-15472: Trial bar' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.setup().click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(jira).queryByRole('heading', { level: 2, name: 'Acceptance criteria' })).not.toBeInTheDocument()
    expect(within(jira).queryByRole('button', { name: 'Comment on QI-15472: Trial bar' })).not.toBeInTheDocument()
    // The other cards keep their own state.
    expect(within(screen.getByRole('article', { name: 'Markdown spec' })).getByRole('button', { name: /^Collapse/ })).toHaveAttribute('aria-expanded', 'true')
    await userEvent.setup().click(within(jira).getByRole('button', { name: 'Expand QI-15472: Trial bar' }))
    expect(within(jira).getByRole('heading', { level: 2, name: 'Acceptance criteria' })).toBeInTheDocument()
  })

  it('renders the Jira, markdown and artifact cards from the derived spec items via /spec/<path>', async () => {
    const api = renderSpec()
    // The page header only counts the sources; the rail lists them.
    expect(await screen.findByTitle('3 sources')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /exported artifact/ })).not.toBeInTheDocument()

    const jira = screen.getByRole('article', { name: 'Jira spec' })
    expect(within(jira).getByText('QI-15472')).toBeInTheDocument()
    expect(within(jira).getByLabelText('Jira ticket')).toBeInTheDocument()
    expect(within(jira).getByRole('link', { name: 'Open in Jira' })).toHaveAttribute('href', 'https://example.atlassian.net/browse/QI-15472')
    expect(await within(jira).findByRole('heading', { level: 2, name: 'Acceptance criteria' })).toBeInTheDocument()

    const plan = screen.getByRole('article', { name: 'Markdown spec' })
    expect(within(plan).getByRole('heading', { level: 2, name: 'plan.md' })).toBeInTheDocument()
    expect(within(plan).getByText('Implementation plan')).toBeInTheDocument()
    expect(within(plan).getByLabelText('Local file')).toHaveAttribute('title', 'Local file: /Users/alex/.claude/plans/trial-bar.md')
    expect(within(plan).getByRole('button', { name: 'Copy path' })).toBeInTheDocument()
    expect(await within(plan).findByText('Hook first')).toBeInTheDocument()

    const artifact = screen.getByRole('article', { name: 'Artifact spec' })
    expect(within(artifact).getByRole('link', { name: 'Open on claude.ai' })).toHaveAttribute('href', 'https://claude.ai/artifact/example')
    const frame = await within(artifact).findByTitle('Trial bar design')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('srcdoc')).toContain('<h1>Trial bar states</h1>')
    expect(within(artifact).getByRole('button', { name: 'Open in new tab' })).toBeInTheDocument()
    expect(api.fetchMock.mock.calls.map((call) => String(call[0]))).toContain(`/api/sessions/${SESSION_ID}/spec/design.html`)
  })

  it('lists existing spec comments and saves a new one with the spec path as its ref', async () => {
    const api = renderSpec(reviewFixture({ comments: [commentFixture('c1', { kind: 'spec', ref: 'plan.md' }, 'Step 2 is missing.')], nextCommentId: 2 }))
    const plan = await screen.findByRole('article', { name: 'Markdown spec' })
    expect(await within(plan).findByText('Step 2 is missing.')).toBeInTheDocument()

    const jira = screen.getByRole('article', { name: 'Jira spec' })
    const user = userEvent.setup()
    await user.click(within(jira).getByRole('button', { name: 'Comment on QI-15472: Trial bar' }))
    await user.type(within(jira).getByRole('textbox', { name: 'Comment on QI-15472: Trial bar' }), 'AC 3 is not covered.')
    await user.click(within(jira).getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(api.puts.at(-1)?.review.comments.at(-1)?.target).toEqual({ kind: 'spec', ref: 'jira.md' }), { timeout: 1500 })
  })

  it('shows the empty state when the spec folder has nothing', async () => {
    mockReviewApi(reviewResponseFixture(reviewFixture()), { contents: CONTENTS })
    render(
      <MemoryRouter>
        <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: { ...detail, spec: [] }, reload: () => {} }}>
          <ReviewProvider>
            <SpecPage />
          </ReviewProvider>
        </SessionContext.Provider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Spec' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No spec')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
