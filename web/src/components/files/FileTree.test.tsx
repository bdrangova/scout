import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { FileTree } from './FileTree'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

const files = sessionDetailFixture.tree.files
const [P0 = '', P1 = '', , P3 = ''] = files.map((file) => file.path)

function renderTree(currentPath: string | null, onSelect = vi.fn<(path: string) => void>()) {
  const review = reviewFixture({
    files: { [P0]: { verdict: 'approved', fingerprint: files[0]?.fingerprint ?? null, viewed: true } },
    comments: [commentFixture('c1', { kind: 'file', ref: P1 }, 'Check the hook deps')],
    nextCommentId: 2,
  })
  mockReviewApi(reviewResponseFixture(review))
  const view = render(
    <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
      <ReviewProvider>
        <FileTree files={files} currentPath={currentPath} onSelect={onSelect} />
      </ReviewProvider>
    </SessionContext.Provider>,
  )
  const rerender = (path: string | null) =>
    view.rerender(
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
        <ReviewProvider>
          <FileTree files={files} currentPath={path} onSelect={onSelect} />
        </ReviewProvider>
      </SessionContext.Provider>,
    )
  return { onSelect, rerender }
}

async function tree() {
  return screen.findByRole('tree', { name: 'Changed files' })
}

function rowNames() {
  return screen.getAllByRole('treeitem').map((row) => row.dataset['id'])
}

describe('FileTree', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('shows compressed folders first, every folder open, with counts, verdicts and comment badges', async () => {
    renderTree(P0)
    await tree()
    expect(rowNames()).toEqual([
      'src/main/client',
      'src/main/client/assets',
      'src/main/client/assets/trial.png',
      'src/main/client/hooks',
      P1,
      'src/main/client/trial',
      'src/main/client/trial/legacyTrialBanner.tsx',
      P3,
      P0,
      'package-lock.json',
    ])
    const client = screen.getByRole('treeitem', { name: /src\/main\/client/ })
    expect(client).toHaveTextContent('src/main/client2/5')
    expect(client).toHaveAttribute('aria-expanded', 'true')
    const current = screen.getByRole('treeitem', { name: 'TrialBar.tsx approved' })
    expect(current).toHaveAttribute('aria-selected', 'true')
    expect(current).toHaveAttribute('title', P0)
    expect(within(current).getByRole('img', { name: 'approved' })).toBeInTheDocument()
    const hook = screen.getByRole('treeitem', { name: /useTrial\.ts/ })
    expect(within(hook).getByTitle('1 open comment')).toHaveTextContent('1')
  })

  it('selects a clicked file and toggles a clicked folder', async () => {
    const { onSelect } = renderTree(P0)
    await tree()
    fireEvent.click(screen.getByRole('treeitem', { name: /useTrial\.ts/ }))
    expect(onSelect).toHaveBeenCalledWith(P1)
    fireEvent.click(screen.getByRole('treeitem', { name: /^hooks/ }))
    expect(screen.queryByRole('treeitem', { name: /useTrial\.ts/ })).not.toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /^hooks/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('filters by path substring, counts the matches and clears with the button or Esc', async () => {
    renderTree(P0)
    await tree()
    const user = userEvent.setup()
    const box = screen.getByRole('searchbox', { name: 'Filter files' })
    await user.type(box, 'SCSS')
    await waitFor(() => expect(rowNames()).toEqual(['src/main/client', 'src/main/client/trial', P3]))
    expect(screen.getByText('1 of 6')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filter' }))
    await waitFor(() => expect(rowNames()).toHaveLength(10))
    await user.type(box, 'nothing')
    expect(await screen.findByText('No files match.')).toBeInTheDocument()
    fireEvent.keyDown(box, { key: 'Escape' })
    await waitFor(() => expect(rowNames()).toHaveLength(10))
  })

  it('collapses and expands everything, and reopens the way to a new current file', async () => {
    const { rerender } = renderTree(P0)
    await tree()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(rowNames()).toEqual(['src/main/client', 'package-lock.json'])
    rerender(P1)
    expect(screen.getByRole('treeitem', { name: /useTrial\.ts/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('treeitem', { name: /trial\.png/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(rowNames()).toHaveLength(10)
  })

  it('moves with the arrow keys and activates with Enter', async () => {
    const { onSelect } = renderTree(P0)
    await tree()
    const client = screen.getByRole('treeitem', { name: /src\/main\/client/ })
    fireEvent.keyDown(client, { key: 'ArrowLeft' })
    expect(client).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(client, { key: 'ArrowRight' })
    expect(client).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(client, { key: 'ArrowDown' })
    const assets = screen.getByRole('treeitem', { name: /^assets/ })
    expect(assets).toHaveFocus()
    fireEvent.keyDown(assets, { key: 'ArrowRight' })
    const png = screen.getByRole('treeitem', { name: /trial\.png/ })
    expect(png).toHaveFocus()
    fireEvent.keyDown(png, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('src/main/client/assets/trial.png')
    fireEvent.keyDown(png, { key: 'ArrowLeft' })
    expect(assets).toHaveFocus()
    fireEvent.keyDown(assets, { key: 'ArrowUp' })
    expect(client).toHaveFocus()
  })
})
