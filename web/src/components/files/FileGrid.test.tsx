import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { FileGrid } from './FileGrid'

vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())

const files = sessionDetailFixture.tree.files
const [P0 = '', P1 = '', P2 = '', P3 = ''] = files.map((file) => file.path)

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="search">{location.search}</output>
}

function renderGrid(extra: Parameters<typeof commentFixture>[] = [], initialSearch = '') {
  const onOpen = vi.fn<(path: string) => void>()
  const onApprove = vi.fn()
  const review = reviewFixture({
    files: {
      [P0]: { verdict: 'approved', fingerprint: files[0]?.fingerprint ?? null, viewed: true },
      [P1]: { verdict: 'rejected', fingerprint: files[1]?.fingerprint ?? null, viewed: true },
      [P2]: { verdict: 'none', fingerprint: null, viewed: true },
      // Approved on an older fingerprint: no longer counts and shows "updated".
      [P3]: { verdict: 'approved', fingerprint: 'ffffffffffffffff', viewed: true },
    },
    comments: [commentFixture('c1', { kind: 'file', ref: P1 }, 'Why the extra dependency?'), ...extra.map((args) => commentFixture(...args))],
    nextCommentId: 2 + extra.length,
  })
  mockReviewApi(reviewResponseFixture(review))
  render(
    <MemoryRouter initialEntries={[`/s/${SESSION_ID}/files${initialSearch}`]}>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
        <ReviewProvider>
          <FileGrid files={files} currentPath={P1} onOpen={onOpen} onApprove={onApprove} />
          <LocationProbe />
        </ReviewProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
  return { onOpen, onApprove }
}

async function tile(path: string): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name: path })
  const item = button.closest('li')
  if (!item) throw new Error(`no tile for ${path}`)
  return item
}

function grid(): HTMLElement {
  return screen.getByRole('list', { name: 'All files' })
}

describe('FileGrid', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('shows one tile per file with the counts, the verdict overlays and the chips', async () => {
    renderGrid()
    const approved = await tile(P0)
    expect(grid().children).toHaveLength(files.length)
    // The filter chips carry the counts; there is no separate summary line.
    const filters = screen.getByRole('group', { name: 'Show files' })
    expect(within(filters).getByRole('button', { name: 'All 6' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(filters).getByRole('button', { name: 'Unreviewed 4' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Approved 1' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Rejected 1' })).toBeInTheDocument()
    expect(screen.queryByText(/approved ·/)).not.toBeInTheDocument()

    expect(approved.querySelector('[data-verdict-overlay]')).toHaveAttribute('data-verdict-overlay', 'approved')
    expect(approved).toHaveAttribute('data-verdict', 'approved')
    expect(within(approved).getByText('Approved')).toBeInTheDocument()
    expect(within(approved).queryByRole('button', { name: `Approve ${P0}` })).not.toBeInTheDocument()
    expect(approved).toHaveClass('ft-react')

    const rejected = await tile(P1)
    expect(rejected.querySelector('[data-verdict-overlay]')).toHaveAttribute('data-verdict-overlay', 'rejected')
    expect(rejected).toHaveAttribute('data-current', 'true')
    expect(within(rejected).getByRole('button', { name: P1 })).toHaveAttribute('aria-current', 'true')
    expect(within(rejected).getByTitle('1 open comment')).toHaveTextContent('1')
    expect(within(rejected).getByText('Modified')).toBeInTheDocument()

    const viewed = await tile(P2)
    expect(viewed.querySelector('[data-verdict-overlay]')).toBeNull()
    expect(within(viewed).getByText('Viewed')).toBeInTheDocument()
    expect(within(await tile('package-lock.json')).getByText('Unreviewed')).toBeInTheDocument()
    expect(within(viewed).getByText('Deleted')).toBeInTheDocument()

    const renamed = await tile(P3)
    expect(renamed.querySelector('[data-verdict-overlay]')).toBeNull()
    expect(within(renamed).getByText('Updated')).toBeInTheDocument()
    expect(within(renamed).getByTitle(`renamed from ${files[3]?.oldPath}`)).toHaveTextContent('Renamed')
    expect(within(renamed).getByText('TrialBar.module.scss')).toBeInTheDocument()
    expect(within(renamed).getByText('src/main/client/trial/')).toBeInTheDocument()

    expect(within(await tile('package-lock.json')).getByText('Collapsed')).toBeInTheDocument()
    expect(within(await tile('src/main/client/assets/trial.png')).getByText('Binary')).toBeInTheDocument()
  })

  it('filters by verdict', async () => {
    renderGrid()
    await tile(P0)
    fireEvent.click(screen.getByRole('button', { name: /^Approved/ }))
    expect(grid().children).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /^Unreviewed/ }))
    expect(grid().children).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: /^Rejected/ }))
    expect(screen.getByRole('button', { name: P1 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(grid().children).toHaveLength(files.length)
  })

  it('a file with only a comment is "commented", not unreviewed', async () => {
    renderGrid([['c2', { kind: 'file', ref: P2 }, 'Is this needed?']])
    const commented = await tile(P2)
    expect(within(commented).getByText('Commented')).toBeInTheDocument()
    expect(within(commented).queryByText('Unreviewed')).not.toBeInTheDocument()
    const filters = screen.getByRole('group', { name: 'Show files' })
    expect(within(filters).getByRole('button', { name: 'Unreviewed 3' })).toBeInTheDocument()
    fireEvent.click(within(filters).getByRole('button', { name: 'Commented 1' }))
    expect(grid().children).toHaveLength(1)
    expect(screen.getByRole('button', { name: P2 })).toBeInTheDocument()
  })

  it('opens a tile on click and approves through the quick button or A on a focused tile', async () => {
    const { onOpen, onApprove } = renderGrid()
    fireEvent.click(await screen.findByRole('button', { name: P2 }))
    expect(onOpen).toHaveBeenCalledWith(P2)

    fireEvent.click(screen.getByRole('button', { name: `Approve ${P2}` }))
    expect(onApprove).toHaveBeenCalledWith(files[2])

    const button = screen.getByRole('button', { name: P1 })
    button.focus()
    fireEvent.keyDown(button, { key: 'a' })
    expect(onApprove).toHaveBeenLastCalledWith(files[1])

    // An approved tile ignores A.
    fireEvent.keyDown(screen.getByRole('button', { name: P0 }), { key: 'A' })
    expect(onApprove).toHaveBeenCalledTimes(2)
  })

  it('clears approval and rejection by clicking the active grid verdict stamps', async () => {
    renderGrid(); const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: `Clear approval ${P0}` }))
    expect(await tile(P0)).toHaveAttribute('data-verdict', 'none')
    await user.click(screen.getByRole('button', { name: `Clear rejection ${P1}` }))
    expect(await tile(P1)).toHaveAttribute('data-verdict', 'none')
    expect(screen.getByRole('button', { name: P1 })).toHaveTextContent('Commented')
  })

  it('filters by file type from the dropdown, keeps the selection in the URL and recounts the verdict filters', async () => {
    const user = userEvent.setup()
    renderGrid()
    await tile(P0)
    await user.click(screen.getByRole('button', { name: 'File types' }))
    const menu = await screen.findByRole('menu')
    // Only the types present, with their extensions and counts.
    expect(within(menu).getAllByRole('menuitemcheckbox')).toHaveLength(5)
    for (const name of ['TypeScript .ts 1', 'React .tsx 2', 'JSON .json 1', 'CSS .scss 1', 'Everything else .png 1']) {
      expect(within(menu).getByRole('menuitemcheckbox', { name })).toHaveAttribute('aria-checked', 'false')
    }
    expect(within(menu).getByRole('menuitem', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true')

    await user.click(within(menu).getByRole('menuitemcheckbox', { name: /^React/ }))
    expect(within(menu).getByRole('menuitemcheckbox', { name: /^React/ })).toHaveAttribute('aria-checked', 'true')
    expect(grid().children).toHaveLength(2)
    expect(screen.getByTestId('search')).toHaveTextContent('?types=react')
    const filters = screen.getByRole('group', { name: 'Show files' })
    expect(within(filters).getByRole('button', { name: 'All 2' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Approved 1' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Rejected 0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'File types, 1 selected' })).toHaveTextContent('1')

    await user.click(within(menu).getByRole('menuitemcheckbox', { name: /^TypeScript/ }))
    // URLSearchParams encodes the comma; the parser reads it back either way.
    expect(screen.getByTestId('search')).toHaveTextContent('?types=ts%2Creact')
    expect(grid().children).toHaveLength(3)

    await user.click(within(menu).getByRole('menuitem', { name: 'Clear' }))
    expect(screen.getByTestId('search')).toHaveTextContent('')
    expect(grid().children).toHaveLength(files.length)
  })

  it('reads the type selection from the URL and offers to clear an empty result', async () => {
    renderGrid([], '?types=json')
    await tile('package-lock.json')
    expect(grid().children).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Approved 0' }))
    expect(screen.queryByRole('list', { name: 'All files' })).not.toBeInTheDocument()
    expect(screen.getByText('No files match these filters.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(grid().children).toHaveLength(files.length)
    expect(screen.getByTestId('search')).toHaveTextContent('')
  })
})
