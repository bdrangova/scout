import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { PrCommentsContext } from '@/state/pr-comments-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { makePrComment, prCommentsValue } from '@/test/pr-comments'
import { FileGrid } from './FileGrid'
import { FileTree } from './FileTree'

vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())

const files = sessionDetailFixture.tree.files
const [P0 = '', P1 = ''] = files.map((file) => file.path)

const value = prCommentsValue([
  makePrComment({ githubId: 1, path: P1, line: 5 }),
  makePrComment({ githubId: 2, path: P1, line: 9, outdated: true }),
  makePrComment({ githubId: 3, path: P0, line: 2 }),
  makePrComment({ githubId: 4, kind: 'general', path: null, line: null, side: null }),
])

function wrap(children: React.ReactNode, prComments = value) {
  mockReviewApi(reviewResponseFixture(reviewFixture()))
  return render(
    <MemoryRouter>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
        <PrCommentsContext.Provider value={prComments}>
          <ReviewProvider>{children}</ReviewProvider>
        </PrCommentsContext.Provider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
}

describe('PR comments in the file tree', () => {
  it('shows a per-file count with its open ones in the title', async () => {
    wrap(<FileTree files={files} currentPath={null} onSelect={vi.fn()} />)
    await screen.findByRole('tree', { name: 'Changed files' })
    const row = screen.getByRole('treeitem', { name: new RegExp(P1.split('/').pop() ?? '') })
    expect(within(row).getByTitle('2 PR comments, 1 open')).toHaveTextContent('2')
  })

  it('offers the GitHub comments filter with the thread count and narrows the tree to those files', async () => {
    wrap(<FileTree files={files} currentPath={null} onSelect={vi.fn()} />)
    await screen.findByRole('tree', { name: 'Changed files' })
    const group = screen.getByRole('group', { name: 'Show files' })
    expect(within(group).getByRole('button', { name: /All files/ })).toHaveAttribute('aria-pressed', 'true')
    const filter = within(group).getByRole('button', { name: /GitHub comments/ })
    expect(filter).toHaveTextContent('3')
    await userEvent.click(filter)
    expect(filter).toHaveAttribute('aria-pressed', 'true')
    const shown = screen.getAllByRole('treeitem').filter((row) => row.dataset['id']?.includes('.'))
    expect(shown.map((row) => row.dataset['id']).sort()).toEqual([P0, P1].sort())
    await userEvent.click(within(group).getByRole('button', { name: /All files/ }))
    expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(shown.length)
  })

  it('shows nothing extra without PR comments', async () => {
    wrap(<FileTree files={files} currentPath={null} onSelect={vi.fn()} />, prCommentsValue([]))
    await screen.findByRole('tree', { name: 'Changed files' })
    expect(screen.queryByRole('group', { name: 'Show files' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-pr-count]')).toBeNull()
  })
})

describe('PR comments in the grid', () => {
  it('shows the count on the tiles of files with threads only', async () => {
    wrap(<FileGrid files={files} currentPath={P0} onOpen={vi.fn()} onApprove={vi.fn()} />)
    const tile = (await screen.findByRole('button', { name: P1 })).closest('li')
    expect(tile && within(tile).getByTitle('2 PR comments, 1 open')).toBeTruthy()
    const other = files.find((file) => file.path !== P0 && file.path !== P1)
    const plain = other && screen.getByRole('button', { name: other.path }).closest('li')
    expect(plain && plain.querySelector('[data-pr-count]')).toBeNull()
  })
})
