import { mergeComments } from '@scout/shared'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { JournalContext } from '@/state/journal-context'
import { ReviewStateContext, type ReviewContextValue } from '@/state/review-context'
import { filesFixture, reviewFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { makeEntry, makeJournal } from '@/test/journal'
import { JournalPage } from './JournalPage'

vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ initialize() {}, render: async () => ({ svg: '<svg />' }) }) },
}))

const FILE = filesFixture[1]?.path ?? ''
const review = reviewFixture()

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderPage(entries: ReturnType<typeof makeEntry>[], dispatch = vi.fn()) {
  const value: ReviewContextValue = {
    state: { review, pendingReject: null, atEnd: false },
    items: sessionDetailFixture.tree.files,
    itemKind: 'file',
    dispatch,
    comments: mergeComments(review, null),
    commentsFor: () => [],
    fileReview: () => null,
    draftFor: () => '',
    setDraft: () => {},
    unsavedDrafts: [],
    setVerdict: () => false,
    progress: { reviewed: 0, total: 1 },
    resolutions: null,
    saveStatus: 'idle',
    flushSave: () => Promise.resolve(true),
    reload: () => {},
  }
  render(
    <MemoryRouter initialEntries={[`/s/${SESSION_ID}/journal`]}>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
        <ReviewStateContext.Provider value={value}>
          <JournalContext.Provider value={{ journal: makeJournal(entries), loading: false, error: null, reload: () => {} }}>
            <Routes>
              <Route path="/s/:id/journal" element={<JournalPage />} />
              <Route path="*" element={<Where />} />
            </Routes>
          </JournalContext.Provider>
        </ReviewStateContext.Provider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
  return dispatch
}

const ENTRIES = [
  makeEntry('j1', { kind: 'decision', title: 'Use a ref', file: FILE, anchor: { side: 'new', line: 4, snippet: 'x' }, createdAt: '2026-10-25T09:00:00.000Z', supersededBy: 'j3' }),
  makeEntry('j2', { kind: 'caveat', title: 'Safari quirk', file: 'src/gone.ts', createdAt: '2026-10-26T09:00:00.000Z' }),
  makeEntry('j3', { kind: 'decision', title: 'Use state after all', file: FILE, createdAt: '2026-10-26T11:00:00.000Z' }),
  makeEntry('j4', { kind: 'summary', title: 'Overall approach', file: null, createdAt: '2026-10-26T12:00:00.000Z' }),
]

afterEach(() => vi.restoreAllMocks())

describe('JournalPage', () => {
  it('lists notes in order, grouped by day, with superseded ones struck through and linking to the replacement', async () => {
    renderPage(ENTRIES)
    const days = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))
    expect(days).toHaveLength(2)
    const old = screen.getByRole('article', { name: 'Use a ref' })
    expect(within(old).getByRole('heading', { name: 'Use a ref' })).toHaveClass('line-through')
    expect(within(old).getByRole('button', { name: /Superseded by j3/ })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Overall approach' })).toHaveTextContent('Session-level')
  })

  it('filters by kind chip and by file', async () => {
    renderPage(ENTRIES)
    await userEvent.click(screen.getByRole('button', { name: 'Caveat' }))
    expect(screen.getAllByRole('article').map((article) => article.getAttribute('data-journal-id'))).toEqual(['j2'])
    await userEvent.click(screen.getByRole('button', { name: 'Caveat' }))
    await userEvent.selectOptions(screen.getByRole('combobox'), FILE)
    expect(screen.getAllByRole('article').map((article) => article.getAttribute('data-journal-id'))).toEqual(['j1', 'j3'])
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Session-level')
    expect(screen.getAllByRole('article').map((article) => article.getAttribute('data-journal-id'))).toEqual(['j4'])
  })

  it('links a file in the diff to the Files page; a file outside it is plain text', async () => {
    renderPage(ENTRIES)
    expect(screen.getByRole('article', { name: 'Safari quirk' }).querySelector('button[aria-label^="Open"]')).toBeNull()
    await userEvent.click(within(screen.getByRole('article', { name: 'Use a ref' })).getByRole('button', { name: new RegExp(`Open ${FILE}`) }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/s/${SESSION_ID}/files/${FILE}`))
  })

  it('replies on a session-level note with an overall comment carrying about', async () => {
    const dispatch = renderPage(ENTRIES)
    const note = screen.getByRole('article', { name: 'Overall approach' })
    await userEvent.click(within(note).getByRole('button', { name: 'Reply' }))
    expect(within(note).getByText(/Replying to Scout/)).toHaveTextContent('Replying to Scout · Overall approach')
    await userEvent.type(within(note).getByRole('textbox'), 'Fine by me')
    await userEvent.click(within(note).getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_COMMENT', target: { kind: 'overall', ref: null }, body: 'Fine by me', about: 'j4' }))
  })

  it('shows an empty state without a journal', () => {
    renderPage([])
    expect(screen.getByText('No notes yet')).toBeInTheDocument()
  })
})
