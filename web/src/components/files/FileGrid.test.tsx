import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import { commentFixture, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { FileGrid } from './FileGrid'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

const files = sessionDetailFixture.tree.files
const [P0 = '', P1 = '', P2 = '', P3 = ''] = files.map((file) => file.path)

function renderGrid(extra: Parameters<typeof commentFixture>[] = []) {
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
    <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
      <ReviewProvider>
        <FileGrid files={files} currentPath={P1} onOpen={onOpen} onApprove={onApprove} />
      </ReviewProvider>
    </SessionContext.Provider>,
  )
  return { onOpen, onApprove }
}

async function tile(path: string): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name: path })
  const item = button.closest('li')
  if (!item) throw new Error(`no tile for ${path}`)
  return item
}

describe('FileGrid', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('shows one tile per file with the counts, the verdict overlays and the chips', async () => {
    renderGrid()
    const approved = await tile(P0)
    expect(screen.getByRole('list', { name: 'All files' }).children).toHaveLength(files.length)
    // The filter chips carry the counts; there is no separate summary line.
    const filters = screen.getByRole('group', { name: 'Show files' })
    expect(within(filters).getByRole('button', { name: 'All 6' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(filters).getByRole('button', { name: 'Unreviewed 4' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Approved 1' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Rejected 1' })).toBeInTheDocument()
    expect(screen.queryByText(/approved ·/)).not.toBeInTheDocument()

    expect(approved.querySelector('[data-verdict-overlay]')).toHaveAttribute('data-verdict-overlay', 'approved')
    expect(within(approved).getByText('approved')).toBeInTheDocument()
    expect(within(approved).queryByRole('button', { name: `Approve ${P0}` })).not.toBeInTheDocument()

    const rejected = await tile(P1)
    expect(rejected.querySelector('[data-verdict-overlay]')).toHaveAttribute('data-verdict-overlay', 'rejected')
    expect(rejected).toHaveAttribute('data-current', 'true')
    expect(within(rejected).getByTitle('1 open comment')).toHaveTextContent('1')

    const viewed = await tile(P2)
    expect(viewed.querySelector('[data-verdict-overlay]')).toBeNull()
    expect(within(viewed).getByText('viewed')).toBeInTheDocument()
    expect(within(await tile('package-lock.json')).getByText('unreviewed')).toBeInTheDocument()
    expect(within(viewed).getByText('deleted')).toBeInTheDocument()

    const renamed = await tile(P3)
    expect(renamed.querySelector('[data-verdict-overlay]')).toBeNull()
    expect(within(renamed).getByText('updated')).toBeInTheDocument()
    expect(within(renamed).getByTitle(`renamed from ${files[3]?.oldPath}`)).toHaveTextContent('renamed')
    expect(within(renamed).getByText('TrialBar.module.scss')).toBeInTheDocument()
    expect(within(renamed).getByText('src/main/client/trial/')).toBeInTheDocument()

    expect(within(await tile('package-lock.json')).getByText('collapsed')).toBeInTheDocument()
    expect(within(await tile('src/main/client/assets/trial.png')).getByText('binary')).toBeInTheDocument()
  })

  it('filters by verdict', async () => {
    renderGrid()
    await tile(P0)
    fireEvent.click(screen.getByRole('button', { name: /^Approved/ }))
    expect(screen.getByRole('list', { name: 'All files' }).children).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /^Unreviewed/ }))
    expect(screen.getByRole('list', { name: 'All files' }).children).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: /^Rejected/ }))
    expect(screen.getByRole('button', { name: P1 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(screen.getByRole('list', { name: 'All files' }).children).toHaveLength(files.length)
  })

  it('a file with only a comment is "commented", not unreviewed', async () => {
    renderGrid([['c2', { kind: 'file', ref: P2 }, 'Is this needed?']])
    const commented = await tile(P2)
    expect(within(commented).getByText('commented')).toBeInTheDocument()
    expect(within(commented).queryByText('unreviewed')).not.toBeInTheDocument()
    const filters = screen.getByRole('group', { name: 'Show files' })
    expect(within(filters).getByRole('button', { name: 'Unreviewed 3' })).toBeInTheDocument()
    fireEvent.click(within(filters).getByRole('button', { name: 'Commented 1' }))
    expect(screen.getByRole('list', { name: 'All files' }).children).toHaveLength(1)
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
})
