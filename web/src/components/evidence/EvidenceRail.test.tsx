import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { EvidencePage } from '@/pages/EvidencePage'
import { commentFixture, reviewFixture, SESSION_ID } from '@/test/fixtures'
import { renderShell } from '@/test/render-shell'

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
// jsdom counts a <header> inside <main> as a second banner, which `renderShell` queries by role.
vi.mock('@/components/common/PageHeader', () => ({
  PageHeader: ({ title, summary, hint }: { title: React.ReactNode; summary?: React.ReactNode; hint?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {summary}
      {hint}
    </div>
  ),
}))
vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ initialize() {}, render: async () => ({ svg: '' }) }) },
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

/** The shell's own catch-all route stands in for `:id`; the page sits at its real `evidence/*`. */
const PAGE = (
  <Routes>
    <Route path="evidence/*" element={<EvidencePage />} />
  </Routes>
)
const PATH = `/s/${SESSION_ID}/evidence/trial-bar.png`

describe('Evidence in the session rail', () => {
  it('lists the items in the rail with the current one marked, and "n / N" in the content header', async () => {
    renderShell(PATH, { page: PAGE })
    const rail = screen.getByRole('complementary', { name: 'Session panel' })
    const list = await within(rail).findByRole('list', { name: 'Evidence items' })
    const rows = within(list).getAllByRole('button')
    expect(rows).toHaveLength(2)
    expect(within(list).getByRole('button', { name: 'trial-bar.png (image)' })).toHaveAttribute('aria-current', 'true')
    expect(within(list).getByRole('button', { name: 'dismiss.webm (video)' })).not.toHaveAttribute('aria-current')
    expect(within(rail).getByText('1 image · 1 video')).toBeInTheDocument()
    // The counter is in the page header, not in a strip under the card.
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(within(rail).queryByText('1 / 2')).not.toBeInTheDocument()
  })

  it('shows the open-comment count on a row that has comments, and names it', async () => {
    const review = reviewFixture({ comments: [commentFixture('c1', { kind: 'evidence', ref: 'dismiss.webm' }, 'Too slow.')], nextCommentId: 2 })
    renderShell(PATH, { page: PAGE, review })
    const list = await screen.findByRole('list', { name: 'Evidence items' })
    const row = within(list).getByRole('button', { name: 'dismiss.webm (video · 1 comment)' })
    expect(row).toHaveTextContent('1')
    expect(within(list).getByRole('button', { name: 'trial-bar.png (image)' })).toHaveTextContent('1')
  })

  it('selecting a row changes the current item, and the header buttons and arrows move too', async () => {
    renderShell(PATH, { page: PAGE })
    const list = await screen.findByRole('list', { name: 'Evidence items' })
    await userEvent.setup().click(within(list).getByRole('button', { name: 'dismiss.webm (video)' }))
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'dismiss.webm (video)' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Next item' })).toBeDisabled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Previous item' }))
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
  })
})
