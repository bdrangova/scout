import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, resolutionsFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { EvidencePage } from './EvidencePage'

vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ initialize() {}, render: async () => ({ svg: '' }) }) },
}))
vi.mock('media-chrome/react', () => {
  const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    MediaController: passthrough,
    MediaControlBar: passthrough,
    MediaPlayButton: passthrough,
    MediaTimeRange: passthrough,
    MediaTimeDisplay: passthrough,
    MediaMuteButton: passthrough,
    MediaFullscreenButton: passthrough,
  }
})

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderEvidence(initialPath: string, response = reviewResponseFixture()) {
  const api = mockReviewApi(response)
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/s/:id"
            element={
              <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
                <ReviewProvider>
                  <Outlet />
                  <LocationProbe />
                </ReviewProvider>
              </SessionContext.Provider>
            }
          >
            <Route path="evidence" element={<EvidencePage />} />
            <Route path="evidence/*" element={<EvidencePage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
  return api
}

const E1 = sessionDetailFixture.evidence[0]
const E2 = sessionDetailFixture.evidence[1]

describe('EvidencePage', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('renders the item named in the URL, with the header counts and position', async () => {
    renderEvidence(`/s/${SESSION_ID}/evidence/dismiss.webm`)
    const card = await screen.findByRole('article', { name: E2?.caption })
    expect(within(card).getByTestId('video-player')).toBeInTheDocument()
    expect(card.querySelector('video')).toHaveAttribute('src', `/api/sessions/${SESSION_ID}/evidence/dismiss.webm`)
    expect(within(card).getByText('Click the close button and reload.')).toBeInTheDocument()
    // The header lists what is there; the item count lives on the Evidence tab, and "0 comments" is not shown.
    expect(screen.getByRole('group', { name: '1 screenshot · 1 recording' })).toBeInTheDocument()
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('defaults to the first item and → moves to the next one, updating the URL', async () => {
    renderEvidence(`/s/${SESSION_ID}/evidence`)
    await screen.findByRole('article', { name: E1?.caption })
    expect(screen.getByTestId('location')).toHaveTextContent(`/s/${SESSION_ID}/evidence/trial-bar.png`)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`/s/${SESSION_ID}/evidence/dismiss.webm`)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
  })

  it('lists only the open comments (keyed by the evidence path) until "Show 1 resolved" is clicked', async () => {
    const review = reviewFixture({
      comments: [
        commentFixture('c1', { kind: 'evidence', ref: 'trial-bar.png' }, 'Badge overlaps the avatar.'),
        commentFixture('c2', { kind: 'evidence', ref: 'trial-bar.png' }, 'Old spacing issue.', { sentAt: '2026-09-21T12:00:00.000Z' }),
        commentFixture('c3', { kind: 'evidence', ref: 'dismiss.webm' }, 'On the other item.'),
      ],
      nextCommentId: 4,
    })
    const resolutions = resolutionsFixture({ c2: { status: 'resolved', note: 'Fixed the padding.', at: '2026-09-22T12:00:00.000Z', files: [] } })
    renderEvidence(`/s/${SESSION_ID}/evidence/trial-bar.png`, reviewResponseFixture(review, resolutions))
    const card = await screen.findByRole('article', { name: E1?.caption })
    expect(await within(card).findByText('Badge overlaps the avatar.')).toBeInTheDocument()
    expect(within(card).queryByText('Old spacing issue.')).not.toBeInTheDocument()
    expect(within(card).queryByText('On the other item.')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: '1 screenshot · 1 recording · 2 open comments' })).toBeInTheDocument()
    expect(within(card).queryByText('No comments yet.')).not.toBeInTheDocument()
    await userEvent.setup().click(within(card).getByRole('button', { name: 'Show 1 resolved' }))
    expect(within(card).getByText('Old spacing issue.')).toBeInTheDocument()
    expect(within(card).getByText('Fixed the padding.')).toBeInTheDocument()
  })

  it('saves a new comment with the evidence path as its ref', async () => {
    const api = renderEvidence(`/s/${SESSION_ID}/evidence/trial-bar.png`)
    const card = await screen.findByRole('article', { name: E1?.caption })
    const user = userEvent.setup()
    // The box starts folded as a "Leave a comment…" row and opens on click.
    expect(within(card).queryByRole('textbox', { name: 'Comment on trial-bar.png' })).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Comment on trial-bar.png' }))
    await user.type(within(card).getByRole('textbox', { name: 'Comment on trial-bar.png' }), 'Looks right.')
    await user.click(within(card).getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(api.puts.at(-1)?.review.comments[0]?.target).toEqual({ kind: 'evidence', ref: 'trial-bar.png' }), { timeout: 1500 })
  })

  it('shows the empty state when the evidence folder has nothing', async () => {
    mockReviewApi(reviewResponseFixture())
    render(
      <MemoryRouter initialEntries={[`/s/${SESSION_ID}/evidence`]}>
        <Routes>
          <Route
            path="/s/:id/evidence/*"
            element={
              <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: { ...sessionDetailFixture, evidence: [] }, reload: () => {} }}>
                <ReviewProvider>
                  <EvidencePage />
                </ReviewProvider>
              </SessionContext.Provider>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Evidence' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No evidence')
    expect(screen.queryByRole('region', { name: 'Evidence' })).not.toBeInTheDocument()
  })
})
