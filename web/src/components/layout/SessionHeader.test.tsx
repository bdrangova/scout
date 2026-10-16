import { progress, type SessionDetail } from '@review-dash/shared'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewStateContext, type ReviewContextValue } from '@/state/review-context'
import { reviewFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { SessionHeader } from './SessionHeader'

function renderHeader(path: string, detail: SessionDetail = sessionDetailFixture, onHelp = vi.fn()) {
  const review = reviewFixture()
  const value: ReviewContextValue = {
    state: { review, pendingReject: null, atEnd: false },
    dispatch: vi.fn(),
    comments: [],
    commentsFor: () => [],
    fileReview: () => null,
    draftFor: () => '',
    setDraft: () => {},
    setVerdict: () => false,
    progress: progress(review, detail.tree),
    resolutions: null,
    saveStatus: 'idle',
    reload: () => {},
  }
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>
        <ReviewStateContext.Provider value={value}>
          <SessionHeader onHelp={onHelp} />
        </ReviewStateContext.Provider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
  return { banner: screen.getByRole('banner'), onHelp }
}

const rowOf = (element: HTMLElement) => element.closest('header > div')

describe('SessionHeader', () => {
  it('has an icon-only back link named Sessions and the archive button in the first row, after the tabs', () => {
    const { banner } = renderHeader(`/s/${SESSION_ID}/files`)
    const back = within(banner).getByRole('link', { name: 'Sessions' })
    expect(back).toHaveAttribute('href', '/')
    const tabs = within(banner).getByRole('navigation', { name: 'Sections' })
    const archive = within(banner).getByRole('button', { name: 'Archive session' })
    expect(rowOf(archive)).toBe(rowOf(back))
    expect(rowOf(archive)).toBe(rowOf(tabs))
    expect(tabs.compareDocumentPosition(archive) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Nothing else sits in row 1 besides the back link, the ticket, the title block, the tabs and archive.
    expect(within(banner).queryByText('· uncommitted changes')).not.toBeInTheDocument()
  })

  it('shows the mode toggle on the files route only, in the second row', () => {
    const { banner } = renderHeader(`/s/${SESSION_ID}/files/a.ts?mode=grid`)
    const toggle = within(banner).getByRole('group', { name: 'Review mode' })
    expect(rowOf(toggle)).toBe(rowOf(within(banner).getByText('0/6')))
    expect(within(toggle).getByRole('link', { name: 'Grid' })).toHaveAttribute('aria-current', 'true')
  })

  it('drops the mode toggle on the other sections but keeps the rest of the second row', () => {
    const { banner } = renderHeader(`/s/${SESSION_ID}/evidence`)
    expect(within(banner).queryByRole('group', { name: 'Review mode' })).not.toBeInTheDocument()
    expect(within(banner).getByText('reviewed')).toBeInTheDocument()
    expect(within(banner).getByText('0/6')).toBeInTheDocument()
    expect(within(banner).getByRole('progressbar', { name: 'Review progress' })).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  it('shows section counts only when there is something, Files always', () => {
    const { banner } = renderHeader(`/s/${SESSION_ID}/files`, { ...sessionDetailFixture, spec: [], extras: [] })
    expect(within(banner).getByRole('link', { name: /^Files/ })).toHaveTextContent('Files6')
    expect(within(banner).getByRole('link', { name: /^Evidence/ })).toHaveTextContent('Evidence2')
    expect(within(banner).getByRole('link', { name: 'Spec' })).toHaveTextContent(/^Spec$/)
    expect(within(banner).getByRole('link', { name: 'Extras' })).toHaveTextContent(/^Extras$/)
    expect(within(banner).getByRole('link', { name: 'Submit' })).toHaveTextContent(/^Submit$/)
  })

  it('shows the empty Files count and opens the help from the keyboard icon', () => {
    const empty: SessionDetail = { ...sessionDetailFixture, tree: { ...sessionDetailFixture.tree, files: [] } }
    const { banner, onHelp } = renderHeader(`/s/${SESSION_ID}/submit`, empty)
    expect(within(banner).getByRole('link', { name: /^Files/ })).toHaveTextContent('Files0')
    fireEvent.click(within(banner).getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(onHelp).toHaveBeenCalledOnce()
  })
})
