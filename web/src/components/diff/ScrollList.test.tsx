import { progress } from '@scout/shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilePatchState } from '@/lib/hooks'
import { ReviewStateContext, type ReviewContextValue } from '@/state/review-context'
import { reviewFixture, SESSION_ID, treeFixture } from '@/test/fixtures'
import { scrollToIndexMock } from '@/test/mock-virtualizer'
import { ScrollList } from './ScrollList'

vi.mock('@tanstack/react-virtual', async () => (await import('@/test/mock-virtualizer')).virtualizerModuleMock())

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch-diff">{patch}</pre>,
}))

vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks')>()),
  useFilePatch: (): FilePatchState => ({ patch: 'diff --git a/x b/x', isLarge: false, isOmitted: false, loading: false, error: null, reload: () => {} }),
}))

const files = treeFixture.files
const review = reviewFixture()

function renderList(currentPath: string, onNavigate = vi.fn()) {
  const value: ReviewContextValue = {
    state: { review, pendingReject: null, atEnd: false },
    items: files,
    itemKind: 'file',
    dispatch: vi.fn(),
    comments: [],
    commentsFor: () => [],
    fileReview: () => null,
    draftFor: () => '',
    setDraft: () => {},
    unsavedDrafts: [],
    setVerdict: () => false,
    progress: progress(review, treeFixture),
    resolutions: null,
    saveStatus: 'idle',
    flushSave: () => Promise.resolve(true),
    reload: () => {},
  }
  const ui = (path: string) => (
    <ReviewStateContext.Provider value={value}>
      <ScrollList files={files} currentPath={path} sessionId={SESSION_ID} onNavigate={onNavigate} />
    </ReviewStateContext.Provider>
  )
  const result = render(ui(currentPath))
  return { ...result, rerenderWith: (path: string) => result.rerender(ui(path)) }
}

describe('ScrollList', () => {
  beforeEach(() => {
    scrollToIndexMock.mockClear()
  })

  it('lays the cards out from the virtualizer and scrolls the current one into view', () => {
    const { rerenderWith } = renderList(files[0]?.path ?? '')
    const rows = screen.getAllByRole('article')
    expect(rows).toHaveLength(files.length)
    expect(rows[0]?.parentElement).toHaveAttribute('data-index', '0')
    expect(rows[1]?.parentElement).toHaveStyle({ transform: 'translateY(640px)' })
    expect(screen.getByTestId('scroll-list')).toHaveStyle({ overflowAnchor: 'none' })
    expect(scrollToIndexMock).toHaveBeenLastCalledWith(0, { align: 'auto' })

    rerenderWith(files[3]?.path ?? '')
    expect(scrollToIndexMock).toHaveBeenLastCalledWith(3, { align: 'auto' })
    expect(rows[3]).toHaveAttribute('data-active', 'true')
  })

  it('makes a clicked card current', () => {
    const onNavigate = vi.fn()
    renderList(files[0]?.path ?? '', onNavigate)
    fireEvent.click(screen.getByText('useTrial.ts'))
    expect(onNavigate).toHaveBeenCalledWith(files[1]?.path)
  })
})
