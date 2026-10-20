import { mergeComments, type Comment } from '@review-dash/shared'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { commentFixture, reviewFixture } from '@/test/fixtures'
import { ThemeContext } from '@/theme/ThemeContext'
import { FileDiffView } from './FileDiffView'
import { LineCommentsContext, type LineCommentsValue } from './line-comments'
import { PrAnnotationsContext } from './pr-annotations'
import { buildPrCommentsResponse } from '@review-dash/shared'
import { makePrComment, makePrComments } from '@review-dash/shared/testing/fixtures'
import { groupPrThreads } from '@/lib/pr-threads'

interface MockProps {
  patch: string
  options?: {
    themeType?: string
    onGutterUtilityClick?: (range: { start: number; side?: string; end: number; endSide?: string }) => void
    enableGutterUtility?: boolean
    loadDiffFiles?: (fileDiff: { name: string }) => Promise<unknown>
  }
  lineAnnotations?: { side: string; lineNumber: number; metadata: unknown }[]
  renderAnnotation?: (annotation: { side: string; lineNumber: number; metadata: unknown }) => React.ReactNode
  selectedLines?: { start: number; end: number; side?: string } | null
}

// The library renders into a shadow DOM; the mock lays its slots out flat and exposes the gutter
// "+" as buttons so the tests can click a line and drag over a range.
vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch, options, lineAnnotations, renderAnnotation, selectedLines }: MockProps) => (
    <div
      data-testid="patch-diff"
      data-theme-type={options?.themeType}
      data-selected={selectedLines ? `${selectedLines.side ?? ''}:${selectedLines.start}-${selectedLines.end}` : undefined}
      data-expandable={options?.loadDiffFiles ? '' : undefined}
    >
      <pre>{patch}</pre>
      {options?.loadDiffFiles && (
        <button type="button" onClick={() => void options.loadDiffFiles?.({ name: 'src/a.ts' }).catch(() => {})}>
          expand
        </button>
      )}
      {options?.enableGutterUtility && (
        <>
          <button type="button" onClick={() => options.onGutterUtilityClick?.({ start: 3, side: 'additions', end: 3 })}>
            gutter new 3
          </button>
          <button type="button" onClick={() => options.onGutterUtilityClick?.({ start: 4, side: 'additions', end: 2, endSide: 'additions' })}>
            gutter new 4-2
          </button>
          <button type="button" onClick={() => options.onGutterUtilityClick?.({ start: 2, side: 'deletions', end: 2 })}>
            gutter old 2
          </button>
        </>
      )}
      {lineAnnotations?.map((annotation, index) => (
        <div key={index} data-testid={`slot:${annotation.side}:${annotation.lineNumber}`}>
          {renderAnnotation?.(annotation)}
        </div>
      ))}
    </div>
  ),
}))

const PATCH = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 import x from 'x'
-const a = 1
+const a = 2
+const b = 3
 export { a }
`

function value(comments: Comment[] = [], overrides: Partial<LineCommentsValue> = {}): LineCommentsValue {
  return {
    comments: mergeComments(reviewFixture({ comments, nextCommentId: comments.length + 1 }), null),
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onResolve: vi.fn(),
    onReopen: vi.fn(),
    ...overrides,
  }
}

function renderView(ctx: LineCommentsValue | null, diffStyle: 'unified' | 'split' = 'unified', loadSides?: () => Promise<{ before: string; after: string }>) {
  return render(
    <LineCommentsContext.Provider value={ctx}>
      <FileDiffView patch={PATCH} diffStyle={diffStyle} loadSides={loadSides} />
    </LineCommentsContext.Provider>,
  )
}

const FULL_AFTER = Array.from({ length: 50 }, (_, index) => (index === 0 ? "import x from 'x'" : `line ${index + 1}`)).join('\n')

describe('FileDiffView line comments', () => {
  it('is a plain read-only diff without a line-comments context', () => {
    renderView(null)
    expect(screen.getByTestId('patch-diff')).toHaveTextContent('const a = 2')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Diff lines' })).not.toBeInTheDocument()
    expect(screen.getByTestId('patch-diff')).not.toHaveAttribute('data-expandable')
  })

  it('follows the app theme (light outside a provider, never the OS scheme)', () => {
    const { rerender } = render(<FileDiffView patch={PATCH} diffStyle="unified" />)
    expect(screen.getByTestId('patch-diff')).toHaveAttribute('data-theme-type', 'light')
    rerender(
      <ThemeContext.Provider value={{ theme: 'dark', resolved: 'dark', setTheme: vi.fn() }}>
        <FileDiffView patch={PATCH} diffStyle="unified" />
      </ThemeContext.Provider>,
    )
    expect(screen.getByTestId('patch-diff')).toHaveAttribute('data-theme-type', 'dark')
    expect(screen.getByTestId('patch-diff').parentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('offers the hidden context only with a sides loader; a comment on a revealed line moves under it once loaded', async () => {
    const loadSides = vi.fn(() => Promise.resolve({ before: FULL_AFTER.replace('line 40', 'old 40'), after: FULL_AFTER }))
    const comments = [commentFixture('c9', { kind: 'file', ref: 'src/a.ts', anchor: { side: 'new', line: 40 } }, 'Outside the hunk.')]
    renderView(value(comments), 'unified', loadSides)
    expect(within(screen.getByTestId('slot:additions:0')).getByText('Outside the hunk.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'expand' }))
    expect(loadSides).toHaveBeenCalledTimes(1)
    expect(within(await screen.findByTestId('slot:additions:40')).getByText('Outside the hunk.')).toBeInTheDocument()
    expect(screen.queryByTestId('slot:additions:0')).not.toBeInTheDocument()
    expect(screen.getByTestId('patch-diff')).toHaveAttribute('data-expandable')
  })

  it('withdraws the offer when the sides cannot be loaded', async () => {
    renderView(value(), 'split', () => Promise.reject(new Error('404')))
    await userEvent.click(screen.getByRole('button', { name: 'expand' }))
    await waitFor(() => expect(screen.getByTestId('patch-diff')).not.toHaveAttribute('data-expandable'))
    expect(screen.queryByRole('button', { name: 'expand' })).not.toBeInTheDocument()
  })

  it('opens a comment box under the clicked line and saves the comment anchored there', async () => {
    const onAdd = vi.fn()
    renderView(value([], { onAdd }))
    await userEvent.click(screen.getByRole('button', { name: 'gutter new 3' }))
    const slot = screen.getByTestId('slot:additions:3')
    const box = within(slot).getByRole('textbox', { name: 'Comment on line 3' })
    expect(screen.getByTestId('patch-diff')).toHaveAttribute('data-selected', 'additions:3-3')
    await userEvent.type(box, 'Name it.')
    await userEvent.click(within(slot).getByRole('button', { name: 'Comment' }))
    expect(onAdd).toHaveBeenCalledWith({ side: 'new', line: 3 }, 'Name it.')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('a dragged gutter range becomes a range anchor under its last line; Cancel closes the box', async () => {
    renderView(value())
    await userEvent.click(screen.getByRole('button', { name: 'gutter new 4-2' }))
    const slot = screen.getByTestId('slot:additions:4')
    expect(within(slot).getByRole('textbox', { name: 'Comment on lines 2–4' })).toBeInTheDocument()
    await userEvent.click(within(slot).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('patch-diff')).not.toHaveAttribute('data-selected')
  })

  it('anchors to the old side from the deletions gutter', async () => {
    renderView(value())
    await userEvent.click(screen.getByRole('button', { name: 'gutter old 2' }))
    expect(within(screen.getByTestId('slot:deletions:2')).getByRole('textbox', { name: 'Comment on old line 2' })).toBeInTheDocument()
  })

  it('renders saved comments under their line (grouped), hides resolved ones and lists comments whose line left the diff at the top', () => {
    const comments = [
      commentFixture('c1', { kind: 'file', ref: 'src/a.ts', anchor: { side: 'new', line: 3 } }, 'First on 3.'),
      commentFixture('c2', { kind: 'file', ref: 'src/a.ts', anchor: { side: 'new', line: 3 } }, 'Second on 3.', { resolvedAt: '2026-09-21T12:00:00.000Z' }),
      commentFixture('c3', { kind: 'file', ref: 'src/a.ts', anchor: { side: 'new', line: 40 } }, 'Gone line.'),
      commentFixture('c4', { kind: 'file', ref: 'src/a.ts', anchor: { side: 'old', line: 2, endLine: 2 } }, 'Why drop this?'),
    ]
    renderView(value(comments), 'split')
    const onThree = screen.getByTestId('slot:additions:3')
    expect(within(onThree).getByText('First on 3.')).toBeInTheDocument()
    expect(within(onThree).queryByText('Second on 3.')).not.toBeInTheDocument()
    expect(within(onThree).getByRole('button', { name: 'Show 1 resolved' })).toBeInTheDocument()
    expect(within(onThree).getAllByText('line 3')).toHaveLength(1)
    expect(within(screen.getByTestId('slot:deletions:2')).getByText('Why drop this?')).toBeInTheDocument()
    const top = screen.getByTestId('slot:additions:0')
    expect(within(top).getByText('line 40 (changed)')).toBeInTheDocument()
    expect(within(top).getByText('Gone line.')).toBeInTheDocument()
    expect(screen.queryByTestId('slot:additions:40')).not.toBeInTheDocument()
  })

  it('the resolve, edit and delete controls of an inline comment dispatch for its id', async () => {
    const ctx = value([commentFixture('c7', { kind: 'file', ref: 'src/a.ts', anchor: { side: 'new', line: 2 } }, 'Inline.')])
    renderView(ctx)
    const slot = screen.getByTestId('slot:additions:2')
    await userEvent.click(within(slot).getByRole('button', { name: 'Mark resolved' }))
    expect(ctx.onResolve).toHaveBeenCalledWith('c7')
    await userEvent.click(within(slot).getByRole('button', { name: 'Delete' }))
    expect(ctx.onDelete).toHaveBeenCalledWith('c7')
  })

  it('moves a keyboard cursor over the lines with the arrows and opens the box with Enter', () => {
    renderView(value())
    const group = screen.getByRole('group', { name: 'Diff lines' })
    group.focus()
    fireEvent.keyDown(group, { key: 'ArrowDown' })
    fireEvent.keyDown(group, { key: 'ArrowDown' })
    // Row 2 is the deleted `const a = 1` (old line 2).
    expect(screen.getByTestId('patch-diff')).toHaveAttribute('data-selected', 'deletions:2-2')
    fireEvent.keyDown(group, { key: 'ArrowDown' })
    fireEvent.keyDown(group, { key: 'ArrowDown', shiftKey: true })
    // Rows 3 and 4 are the added lines 2 and 3 on the new side.
    expect(screen.getByTestId('patch-diff')).toHaveAttribute('data-selected', 'additions:2-3')
    fireEvent.keyDown(group, { key: 'Enter' })
    expect(within(screen.getByTestId('slot:additions:3')).getByRole('textbox', { name: 'Comment on lines 2–3' })).toBeInTheDocument()
  })
})

describe('FileDiffView GitHub comments', () => {
  function threads() {
    const comments = [
      makePrComment({ githubId: 1, path: 'src/a.ts', line: 3, body: 'Inline one.' }),
      makePrComment({ githubId: 2, path: 'src/a.ts', line: 40, body: 'Past the hunk.' }),
      makePrComment({ githubId: 3, path: 'src/a.ts', line: null, outdated: true, body: 'Outdated one.' }),
    ]
    return groupPrThreads(buildPrCommentsResponse(makePrComments(comments), null, null).comments)
  }

  it('hangs a thread under its line without a line-comments context (read-only) and reports what it placed', () => {
    const onPlaced = vi.fn()
    const { unmount } = render(
      <PrAnnotationsContext.Provider value={{ threads: threads(), onPlaced }}>
        <FileDiffView patch={PATCH} diffStyle="unified" />
      </PrAnnotationsContext.Provider>,
    )
    expect(within(screen.getByTestId('slot:additions:3')).getByText('Inline one.')).toBeInTheDocument()
    expect(screen.queryByText('Past the hunk.')).not.toBeInTheDocument()
    expect(screen.queryByText('Outdated one.')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(onPlaced).toHaveBeenLastCalledWith(['rc1'])
    unmount()
    expect(onPlaced).toHaveBeenLastCalledWith([])
  })
})
