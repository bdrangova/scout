import type { EvidenceItem } from '@scout/shared'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { EvidenceCard } from './EvidenceCard'

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

function videoItem(): EvidenceItem {
  const item = sessionDetailFixture.evidence.find((candidate) => candidate.type === 'video')
  if (!item) throw new Error('fixture has no video')
  return item
}
const VIDEO = videoItem()

function renderVideoCard(response = reviewResponseFixture()) {
  const api = mockReviewApi(response)
  const view = render(
    <MemoryRouter>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
        <ReviewProvider>
          <EvidenceCard item={VIDEO} sessionId={SESSION_ID} active />
        </ReviewProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
  return { api, ...view }
}

/** happy-dom's media element has no playback; expose a writable `currentTime` like a browser would. */
function mockVideo(container: HTMLElement, currentTime: number): HTMLVideoElement {
  const video = container.querySelector('video')
  if (!video) throw new Error('no video element')
  Object.defineProperty(video, 'currentTime', { value: currentTime, writable: true, configurable: true })
  Object.defineProperty(video, 'duration', { value: 60, configurable: true })
  Object.defineProperty(video, 'pause', { value: vi.fn(), configurable: true })
  fireEvent.loadedMetadata(video)
  return video
}

describe('VideoPlayer', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('"Comment at" pauses, attaches the playhead time and the saved comment carries timestampSec', async () => {
    const { api, container } = renderVideoCard()
    await screen.findByRole('article', { name: VIDEO.caption })
    const video = mockVideo(container, 42.4)
    fireEvent.timeUpdate(video)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Comment at 0:42' }))
    expect(video.pause).toHaveBeenCalled()
    expect(screen.getByText('attached to 0:42')).toBeInTheDocument()
    const box = screen.getByRole('textbox', { name: 'Comment on dismiss.webm' })
    expect(box).toHaveFocus()
    await user.type(box, 'The modal opens before the bar fades.')
    await user.click(screen.getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(api.puts.at(-1)?.review.comments.at(-1)?.timestampSec).toBe(42), { timeout: 1500 })
    expect(api.puts.at(-1)?.review.comments.at(-1)?.target).toEqual({ kind: 'evidence', ref: 'dismiss.webm' })
    expect(screen.queryByText('attached to 0:42')).not.toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Comment at 0:42' })).toBeInTheDocument()
  })

  it('clicking a timestamped comment seeks the video and highlights it', async () => {
    const review = reviewFixture({
      comments: [commentFixture('c1', { kind: 'evidence', ref: 'dismiss.webm' }, 'Bar should fade first.', { timestampSec: 12 })],
      nextCommentId: 2,
    })
    const { container } = renderVideoCard(reviewResponseFixture(review))
    await screen.findByRole('article', { name: VIDEO.caption })
    const video = mockVideo(container, 0)
    const row = await screen.findByRole('listitem', { name: 'Comment c1' })
    expect(within(row).getByText('at 0:12')).toBeInTheDocument()
    expect(row).toHaveAttribute('data-active', 'false')
    await userEvent.setup().click(within(row).getByText('Bar should fade first.'))
    expect(video.currentTime).toBe(12)
    await waitFor(() => expect(row).toHaveAttribute('data-active', 'true'))
  })
})
