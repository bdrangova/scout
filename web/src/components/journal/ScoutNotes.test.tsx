import { mergeComments, type CommentWithStatus } from '@scout/shared'
import { makeComment } from '@scout/shared/testing/fixtures'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileReviewCard } from '@/components/diff/FileReviewCard'
import type { FilePatchState } from '@/lib/hooks'
import { JournalContext } from '@/state/journal-context'
import { ReviewStateContext, type ReviewContextValue } from '@/state/review-context'
import { makeEntry, makeJournal } from '@/test/journal'
import { makeTreeFile, reviewFixture, SESSION_ID } from '@/test/fixtures'

interface MockProps {
  patch: string
  lineAnnotations?: { side: string; lineNumber: number; metadata: unknown }[]
  renderAnnotation?: (annotation: { side: string; lineNumber: number; metadata: unknown }) => React.ReactNode
}

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch, lineAnnotations, renderAnnotation }: MockProps) => (
    <div>
      <pre data-testid="patch-diff">{patch}</pre>
      {lineAnnotations?.map((annotation, index) => (
        <div key={index} data-testid={`slot:${annotation.side}:${annotation.lineNumber}`}>
          {renderAnnotation?.(annotation)}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ initialize() {}, render: async () => ({ svg: '<svg />' }) }) },
}))

const PATCH = 'diff --git a/src/other.ts b/src/other.ts\n--- a/src/other.ts\n+++ b/src/other.ts\n@@ -1,2 +1,3 @@\n a\n+b\n c\n'
const patchState: FilePatchState = { patch: PATCH, isLarge: false, isOmitted: false, loading: false, error: null, reload: () => {} }

vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks')>()),
  useFilePatch: () => patchState,
}))

const file = makeTreeFile({ path: 'src/other.ts', additions: 1 })
const review = reviewFixture()

function reviewValue(dispatch: () => void, draft: string, setDraft: (key: string, text: string) => void, fileComments: CommentWithStatus[] = []): ReviewContextValue {
  return {
    state: { review, pendingReject: null, atEnd: false },
    items: [file],
    itemKind: 'file',
    dispatch,
    comments: mergeComments(review, null),
    commentsFor: () => fileComments,
    fileReview: () => null,
    draftFor: () => draft,
    setDraft,
    unsavedDrafts: [],
    setVerdict: () => false,
    progress: { reviewed: 0, total: 1 },
    resolutions: null,
    saveStatus: 'idle',
    flushSave: () => Promise.resolve(true),
    reload: () => {},
  }
}

const anchoredAt2 = { side: 'new', line: 2, snippet: 'b' } as const

/** The card's footer box is controlled by the review state: hold its draft here. */
function Harness({ dispatch, comments, children }: { dispatch: () => void; comments?: CommentWithStatus[]; children: ReactNode }) {
  const [draft, setDraft] = useState('')
  return <ReviewStateContext.Provider value={reviewValue(dispatch, draft, (_key, text) => setDraft(text), comments)}>{children}</ReviewStateContext.Provider>
}

function renderCard(entries: ReturnType<typeof makeEntry>[], dispatch = vi.fn(), comments?: CommentWithStatus[]) {
  return render(
    <JournalContext.Provider value={{ journal: makeJournal(entries), loading: false, error: null, reload: () => {} }}>
      <Harness dispatch={dispatch} comments={comments}>
        <FileReviewCard file={file} sessionId={SESSION_ID} />
      </Harness>
    </JournalContext.Provider>,
  )
}

describe("Scout's notes on a file card", () => {
  beforeEach(() => window.localStorage.clear())

  it('shows the summary in a strip with a "+N notes" count for file-level notes', async () => {
    renderCard([
      makeEntry('j1', { kind: 'summary', title: 'Summary', body: 'Adds the **trial** bar.' }),
      makeEntry('j2', { kind: 'caveat', title: 'Flaky on Safari' }),
      makeEntry('j3', { kind: 'summary', title: 'Old summary', body: 'Stale text.', supersededBy: 'j1' }),
    ])
    const strip = screen.getByRole('region', { name: "Scout's notes" })
    expect(await within(strip).findByText('trial')).toBeInTheDocument()
    expect(within(strip).queryByText('Stale text.')).not.toBeInTheDocument()
    const more = within(strip).getByRole('button', { name: '+1 note' })
    expect(within(strip).queryByText('Flaky on Safari')).not.toBeInTheDocument()
    await userEvent.click(more)
    expect(within(strip).getByText('Flaky on Safari')).toBeInTheDocument()
  })

  it('remembers a collapsed strip per session', async () => {
    const first = renderCard([makeEntry('j1', { kind: 'summary', title: 'Summary', body: 'Summary text.' })])
    await userEvent.click(screen.getByRole('button', { name: "Scout's notes" }))
    expect(screen.queryByText('Summary text.')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(`scout:journal-strip:${SESSION_ID}`)).toBe('collapsed')
    first.unmount()
    renderCard([makeEntry('j1', { kind: 'summary', title: 'Summary', body: 'Summary text.' })])
    expect(screen.queryByText('Summary text.')).not.toBeInTheDocument()
  })

  it('renders nothing for a file with no notes', () => {
    renderCard([makeEntry('j1', { file: 'src/elsewhere.ts' })])
    expect(screen.queryByRole('region', { name: "Scout's notes" })).not.toBeInTheDocument()
  })

  it('hangs an anchored note under its line with kind, title, body and "Considered"', async () => {
    renderCard([makeEntry('j1', { kind: 'tradeoff', title: 'Chose a ref', body: 'Avoids a rerender.', anchor: anchoredAt2, alternatives: [{ option: 'State', whyNot: 'Rerenders on every tick' }] })])
    const slot = screen.getByTestId('slot:additions:2')
    const note = within(slot).getByRole('region', { name: 'Scout note: Chose a ref' })
    expect(within(note).getByText('Trade-off')).toBeInTheDocument()
    expect(await within(note).findByText('Avoids a rerender.')).toBeInTheDocument()
    expect(within(note).getByText('Considered')).toBeInTheDocument()
    expect(within(note).getByText('State')).toBeInTheDocument()
    // Placed in the diff: not repeated in the strip.
    expect(screen.queryByRole('region', { name: "Scout's notes" })).not.toBeInTheDocument()
  })

  it('relocates a moved anchor and sends a stale one to the strip with a hint', () => {
    renderCard([
      makeEntry('j1', { title: 'Moved', anchor: { side: 'new', line: 9, snippet: 'b' } }),
      makeEntry('j2', { title: 'Gone', anchor: { side: 'new', line: 3, snippet: 'deleted line' } }),
    ])
    expect(within(screen.getByTestId('slot:additions:2')).getByText('Moved')).toBeInTheDocument()
    const strip = screen.getByRole('region', { name: "Scout's notes" })
    expect(within(strip).getByText('Gone')).toBeInTheDocument()
    expect(within(strip).getByText(/line 3 moved or removed/)).toBeInTheDocument()
    expect(within(strip).queryByText('Moved')).not.toBeInTheDocument()
  })

  it('folds notes to their titles when a file has more than 3', () => {
    renderCard([1, 2, 3, 4].map((n) => makeEntry(`j${n}`, { title: `Note ${n}`, body: `Body ${n}`, anchor: anchoredAt2 })))
    expect(screen.getByRole('button', { name: /Note 1/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Body 1')).not.toBeInTheDocument()
  })

  it('replies under the note itself, then ADD_COMMENT with about', async () => {
    const dispatch = vi.fn()
    renderCard([makeEntry('j7', { title: 'Chose a ref', anchor: anchoredAt2 })], dispatch)
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }))
    expect(document.querySelector('[data-line-draft]')).toBeNull()
    const note = screen.getByRole('region', { name: 'Scout note: Chose a ref' })
    expect(within(note).queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument()
    await userEvent.type(within(note).getByRole('textbox'), 'Why not state?')
    await userEvent.click(within(note).getByRole('button', { name: 'Comment' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_COMMENT', target: { kind: 'file', ref: file.path, anchor: { side: 'new', line: 2 } }, body: 'Why not state?', about: 'j7' })
  })

  it("shows the reviewer's saved reply under the note it answers, not in its own slot", () => {
    const reply: CommentWithStatus = { ...makeComment({ id: 'c5', body: 'Why not state?', target: { kind: 'file', ref: file.path, anchor: { side: 'new', line: 2 } }, about: 'j7' }), status: 'open', resolution: null }
    renderCard([makeEntry('j7', { title: 'Chose a ref', anchor: anchoredAt2 })], vi.fn(), [reply])
    const note = screen.getByRole('region', { name: 'Scout note: Chose a ref' })
    expect(within(note).getByText('Why not state?')).toBeInTheDocument()
    expect(document.querySelector('[data-line-comments]')).toBeNull()
  })

  it('replying to a file-level note makes a file comment with about', async () => {
    const dispatch = vi.fn()
    renderCard([makeEntry('j2', { kind: 'caveat', title: 'Flaky on Safari' })], dispatch)
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }))
    const footer = screen.getByRole('region', { name: `Comments on ${file.path}` })
    expect(within(footer).getByText(/Replying to Scout/)).toHaveTextContent('Replying to Scout · Flaky on Safari')
    const box = within(footer).getByRole('textbox')
    await userEvent.type(box, 'Which version?')
    await userEvent.click(within(box.closest<HTMLElement>('[data-slot="comment-box"]') as HTMLElement).getByRole('button', { name: 'Comment' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_COMMENT', target: { kind: 'file', ref: file.path }, body: 'Which version?', about: 'j2' })
  })
})
