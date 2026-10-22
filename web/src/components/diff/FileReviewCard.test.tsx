import { mergeComments, progress, type CommentWithStatus, type TreeFile } from '@review-dash/shared'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilePatchOptions, FilePatchState } from '@/lib/hooks'
import { ReviewStateContext, type ReviewContextValue } from '@/state/review-context'
import { commentFixture, fp, makeTreeFile, reviewFixture, SESSION_ID, treeFixture } from '@/test/fixtures'
import { CHANGED_PULSE_MS, FileReviewCard } from './FileReviewCard'

interface MockProps {
  patch: string
  options?: { onGutterUtilityClick?: (range: { start: number; side?: string; end: number }) => void }
  lineAnnotations?: { side: string; lineNumber: number }[]
  renderAnnotation?: (annotation: { side: string; lineNumber: number }) => React.ReactNode
}

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch, options, lineAnnotations, renderAnnotation }: MockProps) => (
    <div>
      <pre data-testid="patch-diff">{patch}</pre>
      {options?.onGutterUtilityClick && (
        <button type="button" onClick={() => options.onGutterUtilityClick?.({ start: 5, side: 'additions', end: 5 })}>
          gutter new 5
        </button>
      )}
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

const useFilePatchMock = vi.hoisted(() =>
  vi.fn(
    (_sessionId: string, _path: string, _options: FilePatchOptions = {}): FilePatchState => ({
      patch: 'diff --git a/x b/x',
      isLarge: false,
      isOmitted: false,
      loading: false,
      error: null,
      reload: () => {},
    }),
  ),
)

vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks')>()),
  useFilePatch: useFilePatchMock,
}))

// Both files were approved on their original fingerprint; `changed` has since moved on disk.
const changed = makeTreeFile({ path: 'src/app.ts', additions: 4, deletions: 1, fingerprint: fp('app:v2') })
const untouched = makeTreeFile({ path: 'src/other.ts', additions: 1 })

const review = reviewFixture({
  files: {
    [changed.path]: { verdict: 'approved', fingerprint: fp('app:v1'), viewed: true },
    [untouched.path]: { verdict: 'approved', fingerprint: untouched.fingerprint, viewed: true },
  },
})

function contextValue(dispatch = vi.fn(), draft = '', comments: CommentWithStatus[] = []): ReviewContextValue {
  return {
    state: { review, pendingReject: null, atEnd: false },
    items: [changed, untouched],
    itemKind: 'file',
    dispatch,
    comments: mergeComments(review, null),
    commentsFor: () => comments,
    fileReview: (p) => review.files[p] ?? null,
    draftFor: () => draft,
    setDraft: () => {},
    unsavedDrafts: [],
    setVerdict: (path, verdict, fingerprint) => {
      dispatch({ type: 'SET_VERDICT', path, verdict, fingerprint })
      return false
    },
    progress: progress(review, { ...treeFixture, files: [changed, untouched] }),
    resolutions: null,
    saveStatus: 'idle',
    flushSave: () => Promise.resolve(true),
    reload: () => {},
  }
}

function card(file: TreeFile, dispatch = vi.fn(), draft = '') {
  return (
    <ReviewStateContext.Provider value={contextValue(dispatch, draft)}>
      <FileReviewCard file={file} sessionId={SESSION_ID} />
    </ReviewStateContext.Provider>
  )
}

describe('FileReviewCard', () => {
  beforeEach(() => {
    useFilePatchMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says a typed draft goes out with the verdict', () => {
    render(card(untouched, vi.fn(), 'Looks fine'))
    expect(screen.getByText('Your comment is sent with the verdict.')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Looks fine')
  })

  it('shows the "updated" chip and drops the stale verdict for a file that changed on disk since', () => {
    render(card(changed))
    const article = screen.getByRole('article', { name: changed.path })
    expect(screen.getByText('updated since sent')).toBeInTheDocument()
    expect(article).toHaveAttribute('data-verdict', 'none')
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the verdict of a file whose fingerprint did not move', () => {
    render(card(untouched))
    expect(screen.queryByText('updated')).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: untouched.path })).toHaveAttribute('data-verdict', 'approved')
  })

  it('pins a verdict to the file fingerprint', () => {
    const dispatch = vi.fn()
    render(card(untouched, dispatch))
    screen.getByRole('button', { name: 'Approve' }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_VERDICT', path: untouched.path, verdict: 'approved', fingerprint: untouched.fingerprint })
  })

  it('pulses "changed just now" and refetches the patch when the fingerprint moves while mounted', () => {
    vi.useFakeTimers()
    const { rerender } = render(card(untouched))
    expect(screen.queryByText('changed just now')).not.toBeInTheDocument()
    expect(useFilePatchMock).toHaveBeenLastCalledWith(SESSION_ID, untouched.path, expect.objectContaining({ fingerprint: untouched.fingerprint }))

    const moved = { ...untouched, fingerprint: fp('other:v2') }
    rerender(card(moved))
    const article = screen.getByRole('article', { name: untouched.path })
    expect(article).toHaveAttribute('data-changed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('changed just now')
    expect(useFilePatchMock).toHaveBeenLastCalledWith(SESSION_ID, untouched.path, expect.objectContaining({ fingerprint: moved.fingerprint }))
    // The verdict was pinned to the old fingerprint: it no longer counts.
    expect(article).toHaveAttribute('data-verdict', 'none')
    expect(screen.getByText('updated since sent')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(CHANGED_PULSE_MS + 10)
    })
    expect(article).not.toHaveAttribute('data-changed')
    expect(screen.queryByText('changed just now')).not.toBeInTheDocument()
  })

  describe('line comments', () => {
    const PATCH = 'diff --git a/src/other.ts b/src/other.ts\n--- a/src/other.ts\n+++ b/src/other.ts\n@@ -1,2 +1,3 @@\n a\n+b\n c\n'
    const lineComment = commentFixture('c1', { kind: 'file', ref: untouched.path, anchor: { side: 'new', line: 2 } }, 'Inline note.')
    const fileComment = commentFixture('c2', { kind: 'file', ref: untouched.path }, 'Footer note.')

    it('shows anchored comments inside the diff and file comments in the footer; the card counts as commented', () => {
      useFilePatchMock.mockReturnValue({ patch: PATCH, isLarge: false, isOmitted: false, loading: false, error: null, reload: () => {} })
      const comments = mergeComments(reviewFixture({ comments: [lineComment, fileComment], nextCommentId: 3 }), null)
      render(
        <ReviewStateContext.Provider value={contextValue(vi.fn(), '', comments)}>
          <FileReviewCard file={{ ...untouched, additions: 1 }} sessionId={SESSION_ID} />
        </ReviewStateContext.Provider>,
      )
      expect(screen.getByText('Inline note.').closest('[data-testid="slot:additions:2"]')).not.toBeNull()
      const footer = screen.getByRole('region', { name: `Comments on ${untouched.path}` })
      expect(within(footer).getByText('Footer note.')).toBeInTheDocument()
      expect(within(footer).queryByText('Inline note.')).not.toBeInTheDocument()
      expect(screen.getByText('line 2')).toBeInTheDocument()
    })

    it('dispatches ADD_COMMENT with the anchor from the gutter "+"', async () => {
      useFilePatchMock.mockReturnValue({ patch: PATCH, isLarge: false, isOmitted: false, loading: false, error: null, reload: () => {} })
      const dispatch = vi.fn()
      render(card(untouched, dispatch))
      await userEvent.click(screen.getByRole('button', { name: 'gutter new 5' }))
      await userEvent.type(screen.getByRole('textbox', { name: 'Comment on line 5' }), 'Check this')
      await userEvent.click(within(screen.getByTestId('slot:additions:5')).getByRole('button', { name: 'Comment' }))
      expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_COMMENT', target: { kind: 'file', ref: untouched.path, anchor: { side: 'new', line: 5 } }, body: 'Check this' })
    })
  })

  describe('markdown preview', () => {
    const readme = makeTreeFile({ path: 'docs/readme.md', additions: 3 })

    function markdownResponse(body: string): Response {
      return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })
    }

    it('offers Preview only for markdown files', () => {
      const { unmount } = render(card(untouched))
      expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument()
      unmount()
      render(card(readme))
      const group = screen.getByRole('group', { name: 'Diff layout' })
      expect(within(group).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Unified diff', 'Split diff', 'Preview'])
      expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('fetches the after side, renders the markdown and switches back to the diff', async () => {
      const fetchMock = vi.fn().mockResolvedValue(markdownResponse('# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |'))
      vi.stubGlobal('fetch', fetchMock)
      render(card(readme))
      expect(screen.getByTestId('patch-diff')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
      expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true')
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/sessions/${SESSION_ID}/files/docs/readme.md/contents?side=after`)
      expect(await screen.findByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
      expect(screen.getByRole('table')).toBeInTheDocument()
      expect(screen.getByText('Rendered after side ·')).toBeInTheDocument()
      expect(screen.queryByTestId('patch-diff')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Unified diff' }))
      expect(screen.getByTestId('patch-diff')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    })

    it('previews the before side of a deleted markdown file', async () => {
      const fetchMock = vi.fn().mockResolvedValue(markdownResponse('# Gone'))
      vi.stubGlobal('fetch', fetchMock)
      const deleted = makeTreeFile({ path: 'docs/old.md', status: 'deleted', additions: 0, deletions: 9, sizeBefore: 300, sizeAfter: null })
      render(card(deleted))
      await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/sessions/${SESSION_ID}/files/docs/old.md/contents?side=before`)
      expect(await screen.findByRole('heading', { level: 1, name: 'Gone' })).toBeInTheDocument()
      expect(screen.getByText('Rendered before side (deleted) ·')).toBeInTheDocument()
    })

    it('shows a retry notice when the contents request fails', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('nope', { status: 500, headers: { 'content-type': 'text/plain' } }))
        .mockResolvedValueOnce(markdownResponse('# Back'))
      vi.stubGlobal('fetch', fetchMock)
      render(card(readme))
      await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
      expect(await screen.findByText("Couldn't load this preview")).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'Back' })).toBeInTheDocument()
    })
  })

  describe('in a commit scope', () => {
    const scopeSha = 'c'.repeat(40)
    // The scope's own version of the file has its own fingerprint; the verdict must use the full diff's.
    const scoped = { ...untouched, fingerprint: fp('other:scope'), additions: 9 }

    it('reads the patch from the scope route, keeps the full-diff verdict and pins a new one to the full fingerprint', () => {
      const dispatch = vi.fn()
      const advanceFrom = vi.fn()
      render(
        <ReviewStateContext.Provider value={contextValue(dispatch)}>
          <FileReviewCard file={scoped} sessionId={SESSION_ID} scope={{ scope: scopeSha, fullFile: () => untouched, advanceFrom }} />
        </ReviewStateContext.Provider>,
      )
      expect(useFilePatchMock).toHaveBeenLastCalledWith(SESSION_ID, scoped.path, expect.objectContaining({ scope: scopeSha, fingerprint: scoped.fingerprint }))
      expect(screen.getByRole('article', { name: scoped.path })).toHaveAttribute('data-verdict', 'approved')
      expect(screen.getByText('+9')).toBeInTheDocument()
      screen.getByRole('button', { name: 'Approve' }).click()
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_VERDICT', path: scoped.path, verdict: 'approved', fingerprint: untouched.fingerprint })
      expect(advanceFrom).toHaveBeenCalledWith(scoped.path)
    })

    it('disables the verdict and comment controls for a file with no net change in the full diff', () => {
      const dispatch = vi.fn()
      render(
        <ReviewStateContext.Provider value={contextValue(dispatch)}>
          <FileReviewCard file={scoped} sessionId={SESSION_ID} scope={{ scope: scopeSha, fullFile: () => null, advanceFrom: vi.fn() }} />
        </ReviewStateContext.Provider>,
      )
      expect(screen.getByRole('article', { name: scoped.path })).toHaveAttribute('data-verdict', 'none')
      expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled()
      expect(screen.queryByRole('button', { name: /^Comment on/ })).not.toBeInTheDocument()
      expect(screen.getByText(/No net change in the full diff/)).toBeInTheDocument()
      screen.getByRole('button', { name: 'Approve' }).click()
      expect(dispatch).not.toHaveBeenCalled()
    })
  })
})
