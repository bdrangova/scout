import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { StrictMode } from 'react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { ReviewProvider } from '@/state/ReviewProvider'
import {
  COMMIT_SHAS,
  commentFixture,
  fp,
  makeCommitList,
  makeTreeFile,
  resolutionsFixture,
  reviewFixture,
  reviewResponseFixture,
  SESSION_ID,
  sessionDetailFixture,
} from '@/test/fixtures'
import { mockReviewApi, type ReviewApiMockOptions } from '@/test/mock-api'
import { makeTree } from '@review-dash/shared/testing/fixtures'
import { FilesPage } from './FilesPage'

vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch-diff">{patch}</pre>,
  WorkerPoolContextProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

// happy-dom has no layout: render every row instead of measuring the scroller.
vi.mock('@tanstack/react-virtual', async () => (await import('@/test/mock-virtualizer')).virtualizerModuleMock())

const files = sessionDetailFixture.tree.files
const P0 = files[0]?.path ?? ''
const P1 = files[1]?.path ?? ''

function renderFiles(initialPath: string, response = reviewResponseFixture(), options: ReviewApiMockOptions = {}) {
  const api = mockReviewApi(response, options)
  // StrictMode double-invokes effects on mount, like the dev build does.
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
        <Route
          path="/s/:id"
          element={
            <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
              <ReviewProvider>
                <Outlet />
              </ReviewProvider>
            </SessionContext.Provider>
          }
        >
          <Route path="files" element={<FilesPage />} />
          <Route path="files/*" element={<FilesPage />} />
          <Route path="submit" element={<h2>Submit page</h2>} />
        </Route>
      </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
  return api
}

async function firstCard() {
  return screen.findByRole('article', { name: P0 })
}

describe('FilesPage', () => {
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  // Each test re-stubs fetch; un-stubbing only at the end keeps the unmount keepalive save mocked.
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('renders the first file card with its header, the diff, the actions and the counter', async () => {
    renderFiles(`/s/${SESSION_ID}/files`)
    const card = await firstCard()
    expect(within(card).getByText('TrialBar.tsx')).toBeInTheDocument()
    expect(within(card).getByText('src/main/client/trial/')).toBeInTheDocument()
    expect(within(card).getByText('added')).toBeInTheDocument()
    expect(within(card).getByText('+120')).toBeInTheDocument()
    expect(within(card).getByText('−0')).toBeInTheDocument()
    expect(within(card).getByText('file 1 of 6')).toBeInTheDocument()
    expect(await within(card).findByTestId('patch-diff')).toHaveTextContent('diff --git')
    expect(within(card).getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    const collapsed = within(card).getByRole('button', { name: 'Comment on TrialBar.tsx' })
    expect(within(card).queryByRole('textbox', { name: 'Comment on TrialBar.tsx' })).not.toBeInTheDocument()
    fireEvent.click(collapsed)
    expect(within(card).getByRole('textbox', { name: 'Comment on TrialBar.tsx' })).toBeInTheDocument()
    expect(screen.getByText('1 / 6')).toBeInTheDocument()
  })

  it('moves between files with ← and → and marks them viewed', async () => {
    const api = renderFiles(`/s/${SESSION_ID}/files`)
    await firstCard()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(await screen.findByText('2 / 6')).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: P1 })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(await screen.findByText('1 / 6')).toBeInTheDocument()
    await waitFor(() => expect(api.puts.at(-1)?.review.files[P1]?.viewed).toBe(true), { timeout: 1500 })
  })

  it('opens the review’s current file when the URL names none, and the URL’s file otherwise', async () => {
    const stored = reviewFixture({ ui: { mode: 'swipe', currentFile: P1, section: 'files' } })
    renderFiles(`/s/${SESSION_ID}/files`, reviewResponseFixture(stored))
    expect(await screen.findByText('2 / 6')).toBeInTheDocument()
  })

  it('opens on the next unreviewed file when the current one is already approved', async () => {
    const approved = (path: string, fingerprint: string | undefined) => ({ verdict: 'approved' as const, fingerprint: fingerprint ?? null, viewed: true })
    const stored = reviewFixture({
      ui: { mode: 'swipe', currentFile: files[5]?.path ?? null, section: 'files' },
      files: Object.fromEntries(files.filter((_, index) => index !== 2).map((file) => [file.path, approved(file.path, file.fingerprint)])),
    })
    renderFiles(`/s/${SESSION_ID}/files`, reviewResponseFixture(stored))
    expect(await screen.findByText('3 / 6')).toBeInTheDocument()
  })

  it('a URL that names a file wins over the review’s current file and updates it', async () => {
    const stored = reviewFixture({ ui: { mode: 'swipe', currentFile: P1, section: 'files' } })
    const api = renderFiles(`/s/${SESSION_ID}/files/${files[3]?.path}`, reviewResponseFixture(stored))
    expect(await screen.findByText('4 / 6')).toBeInTheDocument()
    await waitFor(() => expect(api.puts.at(-1)?.review.ui.currentFile).toBe(files[3]?.path), { timeout: 1500 })
    expect(screen.getByText('4 / 6')).toBeInTheDocument()
  })

  it('approve makes the next file current and saves the verdict immediately', async () => {
    const api = renderFiles(`/s/${SESSION_ID}/files`)
    const card = await firstCard()
    const user = userEvent.setup()
    await user.click(within(card).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('2 / 6')).toBeInTheDocument()
    await waitFor(() => expect(api.puts.some((put) => put.review.files[P0]?.verdict === 'approved')).toBe(true))
    const saved = api.puts.find((put) => put.review.files[P0]?.verdict === 'approved')
    expect(saved?.review.ui.currentFile).toBe(P1)
    expect(saved?.review.files[P0]?.fingerprint).toBe(files[0]?.fingerprint)
    expect(api.patchRequests[0]).toBe(`/api/sessions/${SESSION_ID}/files/${P0}/patch`)
  })

  it('X starts a reject: the comment box is focused, an empty submit is blocked, ⌘+Enter stores the reject and advances', async () => {
    const api = renderFiles(`/s/${SESSION_ID}/files`)
    await firstCard()
    fireEvent.keyDown(window, { key: 'x' })
    const box = await screen.findByRole('textbox', { name: 'Why reject TrialBar.tsx?' })
    await waitFor(() => expect(box).toHaveFocus())
    const submit = screen.getByRole('button', { name: 'Comment & Reject' })
    expect(submit).toBeDisabled()
    expect(screen.getByText('Rejecting · add a comment')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(box, 'Day count is off by one')
    expect(submit).toBeEnabled()
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true })

    expect(await screen.findByText('2 / 6')).toBeInTheDocument()
    await waitFor(() => expect(api.puts.some((put) => put.review.files[P0]?.verdict === 'rejected')).toBe(true))
    const saved = api.puts.find((put) => put.review.files[P0]?.verdict === 'rejected')
    expect(saved?.review.comments[0]).toMatchObject({ target: { kind: 'file', ref: P0 }, body: 'Day count is off by one' })
    expect(saved?.review.files[P0]?.fingerprint).toBe(files[0]?.fingerprint)
  })

  it('Esc cancels a pending reject', async () => {
    renderFiles(`/s/${SESSION_ID}/files`)
    await firstCard()
    fireEvent.keyDown(window, { key: 'x' })
    const box = await screen.findByRole('textbox', { name: 'Why reject TrialBar.tsx?' })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(await screen.findByRole('textbox', { name: 'Comment on TrialBar.tsx' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comment & Reject' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'r' })
    await screen.findByRole('textbox', { name: 'Why reject TrialBar.tsx?' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(await screen.findByRole('textbox', { name: 'Comment on TrialBar.tsx' })).toBeInTheDocument()
    expect(screen.getByText('1 / 6')).toBeInTheDocument()
  })

  it('hides resolved comments behind the toggle and reopens them', async () => {
    const review = reviewFixture({
      comments: [
        commentFixture('c1', { kind: 'file', ref: P0 }, 'Needs a unit test'),
        commentFixture('c2', { kind: 'file', ref: P0 }, 'Off by one on the last day'),
      ],
      nextCommentId: 3,
    })
    // Far in the past so a reopen stamped with the real clock always wins.
    const resolutions = resolutionsFixture(
      { c2: { status: 'resolved', note: 'Switched to Math.ceil', at: '2020-01-01T00:00:00.000Z', files: [P0] } },
      '2020-01-01T00:00:00.000Z',
    )
    const api = renderFiles(`/s/${SESSION_ID}/files`, reviewResponseFixture(review, resolutions))
    const card = await firstCard()
    expect(within(card).getByText('Needs a unit test')).toBeInTheDocument()
    expect(within(card).queryByText('Off by one on the last day')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(within(card).getByRole('button', { name: 'Show 1 resolved' }))
    expect(within(card).getByText('Off by one on the last day')).toBeInTheDocument()
    expect(within(card).getByText('Switched to Math.ceil')).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(within(card).queryByRole('button', { name: /^(Show|Hide) \d+ resolved$/ })).not.toBeInTheDocument())
    expect(within(card).getByRole('listitem', { name: 'Comment c2' })).toHaveTextContent('Off by one on the last day')
    await waitFor(() => expect(api.puts.at(-1)?.review.comments[1]?.reopenedAt).toBeTruthy(), { timeout: 1500 })
  })

  it('brings a file approved on an older fingerprint back into the deck', async () => {
    const stale = Object.fromEntries(
      files.map((file, index) => [file.path, { verdict: 'approved' as const, fingerprint: index === 2 ? 'ffffffffffffffff' : file.fingerprint, viewed: true }]),
    )
    renderFiles(`/s/${SESSION_ID}/files/${P1}`, reviewResponseFixture(reviewFixture({ files: stale })))
    const card = await screen.findByRole('article', { name: P1 })
    expect(card).toHaveAttribute('data-verdict', 'approved')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    const third = await screen.findByRole('article', { name: files[2]?.path ?? '' })
    expect(within(third).getByText('updated')).toBeInTheDocument()
    expect(third).toHaveAttribute('data-verdict', 'none')
  })

  it('redirects to Submit when the last file gets reviewed', async () => {
    const approved = Object.fromEntries(
      files.slice(1).map((file) => [file.path, { verdict: 'approved' as const, fingerprint: file.fingerprint, viewed: true }]),
    )
    renderFiles(`/s/${SESSION_ID}/files`, reviewResponseFixture(reviewFixture({ files: approved })))
    const card = await firstCard()
    const user = userEvent.setup()
    await user.click(within(card).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Submit page')).toBeInTheDocument()
  })

  it('renders every card in scroll mode, persists the mode and makes a clicked card current', async () => {
    const api = renderFiles(`/s/${SESSION_ID}/files?mode=scroll`)
    await firstCard()
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(files.length)
    expect(cards[0]).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('Binary file')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show diff anyway' })).toBeInTheDocument()
    expect(screen.queryByText('1 / 6')).not.toBeInTheDocument()

    const second = cards[1]
    if (!second) throw new Error('missing second card')
    fireEvent.click(within(second).getByText('useTrial.ts'))
    await waitFor(() => expect(second).toHaveAttribute('data-active', 'true'))
    await waitFor(() => expect(api.puts.at(-1)?.review.ui.mode).toBe('scroll'), { timeout: 1500 })
  })

  it('lists the files in the sidebar tree, follows the current file and goes to a clicked one', async () => {
    renderFiles(`/s/${SESSION_ID}/files`)
    await firstCard()
    const tree = screen.getByRole('tree', { name: 'Changed files' })
    expect(within(tree).getByRole('treeitem', { name: /TrialBar\.tsx/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(within(tree).getByRole('treeitem', { name: /useTrial\.ts/ })).toHaveAttribute('aria-selected', 'true'))
    fireEvent.click(within(tree).getByRole('treeitem', { name: /TrialBar\.module\.scss/ }))
    expect(await screen.findByText('4 / 6')).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: files[3]?.path ?? '' })).toBeInTheDocument()
  })

  it('B hides and shows the sidebar, the timeline row offers it back and the choice is remembered', async () => {
    renderFiles(`/s/${SESSION_ID}/files`)
    await firstCard()
    expect(screen.getByRole('complementary', { name: 'Files sidebar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show files sidebar' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'b' })
    expect(screen.queryByRole('complementary', { name: 'Files sidebar' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('review-dash:files-sidebar')).toBe('closed')
    fireEvent.click(within(screen.getByRole('region', { name: 'Commits' })).getByRole('button', { name: 'Show files sidebar' }))
    expect(screen.getByRole('complementary', { name: 'Files sidebar' })).toBeInTheDocument()
  })

  it('grid mode shows a tile per file, ignores the card keys and opens a tile in the last card mode', async () => {
    const api = renderFiles(`/s/${SESSION_ID}/files?mode=grid`)
    const grid = await screen.findByRole('list', { name: 'All files' })
    expect(grid.children).toHaveLength(files.length)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(grid.querySelector('[data-current]')).toHaveAttribute('data-path', P0)
    await waitFor(() => expect(api.puts.at(-1)?.review.ui.mode).toBe('grid'), { timeout: 1500 })

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(grid.querySelector('[data-current]')).toHaveAttribute('data-path', P0)
    expect(api.puts.some((put) => put.review.files[P0]?.verdict === 'approved')).toBe(false)

    const tile = screen.getByRole('button', { name: P1 })
    tile.focus()
    fireEvent.keyDown(tile, { key: 'a' })
    await waitFor(() => expect(api.puts.some((put) => put.review.files[P1]?.verdict === 'approved')).toBe(true))
    expect(grid.querySelector(`[data-path="${P1}"]`)).toHaveAttribute('data-verdict', 'approved')

    window.localStorage.setItem('review-dash:last-card-mode', 'scroll')
    fireEvent.click(screen.getByRole('button', { name: files[2]?.path ?? '' }))
    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(files.length)
    await waitFor(() => expect(screen.getByRole('article', { name: files[2]?.path ?? '' })).toHaveAttribute('data-active', 'true'))
  })

  describe('with a commit scope', () => {
    const P3 = files[3]?.path ?? ''
    const REVERTED = 'src/main/client/trial/reverted.ts'
    const short = COMMIT_SHAS.first.slice(0, 7)
    // The commit's own version of three files, in its own order, with its own fingerprints; `REVERTED` was undone later.
    const scopeFiles = [
      makeTreeFile({ path: P3, status: 'added', additions: 4, deletions: 0, fingerprint: fp(`${P3}:scope`) }),
      makeTreeFile({ path: P1, additions: 2, deletions: 2, fingerprint: fp(`${P1}:scope`) }),
      makeTreeFile({ path: REVERTED, status: 'added', additions: 7, deletions: 0, fingerprint: fp('reverted:scope') }),
    ]
    const scopeTree = makeTree({ baseRef: `${COMMIT_SHAS.first}^1`, branch: null, dirty: false, files: scopeFiles })

    /** The grid is remounted when the scope swaps the file list, so it is looked up again each time. */
    function grid() {
      return screen.getByRole('list', { name: 'All files' })
    }
    const options: ReviewApiMockOptions = { commits: makeCommitList(), scopes: { [COMMIT_SHAS.first]: scopeTree } }

    it('shows the timeline with the live commits and an inline note when the commits route fails', async () => {
      renderFiles(`/s/${SESSION_ID}/files?mode=grid`)
      await screen.findByRole('list', { name: 'All files' })
      expect(await screen.findByRole('status')).toHaveTextContent("Couldn't load the commits")
      expect(screen.getByRole('button', { name: /^Full diff: 6 files/ })).toHaveAttribute('aria-pressed', 'true')
    })

    it('the grid and the tree follow the scope without a banner; a verdict is pinned to the full-diff fingerprint; a reverted file has no controls', async () => {
      const api = renderFiles(`/s/${SESSION_ID}/files?mode=grid&commit=${COMMIT_SHAS.first}`, reviewResponseFixture(), options)
      await screen.findByRole('list', { name: 'All files' })
      await waitFor(() => expect(grid().children).toHaveLength(3))
      expect([...grid().children].map((tile) => tile.getAttribute('data-path'))).toEqual([P3, P1, REVERTED])
      expect(screen.queryByText(/Showing the changes of/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back to full diff' })).not.toBeInTheDocument()
      expect(screen.getByRole('main')).toHaveAttribute('data-scope', COMMIT_SHAS.first)
      const tree = screen.getByRole('tree', { name: 'Changed files' })
      expect(within(tree).getAllByRole('treeitem', { selected: true })).toHaveLength(1)
      expect(within(tree).getByRole('treeitem', { name: /reverted\.ts/ })).toBeInTheDocument()
      expect(within(tree).queryByRole('treeitem', { name: /useTrial/ })).toBeInTheDocument()
      expect(within(screen.getByRole('complementary', { name: 'Files sidebar' })).getByText('3')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `Commit ${short}: add shell breadcrumb/title helpers, wire up BasePage` })).toHaveAttribute('aria-pressed', 'true')

      const reverted = grid().querySelector(`[data-path="${REVERTED}"]`)
      expect(reverted).toHaveTextContent('no net change in the full diff')
      expect(screen.queryByRole('button', { name: `Approve ${REVERTED}` })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: `Approve ${P1}` }))
      await waitFor(() => expect(api.puts.some((put) => put.review.files[P1]?.verdict === 'approved')).toBe(true))
      const saved = api.puts.find((put) => put.review.files[P1]?.verdict === 'approved')
      expect(saved?.review.files[P1]?.fingerprint).toBe(files[1]?.fingerprint)
      expect(grid().querySelector(`[data-path="${P1}"]`)).toHaveAttribute('data-verdict', 'approved')
    })

    it('cards read the scope patch, approving advances along the scope and never redirects to Submit', async () => {
      const approvedRest = Object.fromEntries(
        files.filter((file) => file.path !== P3 && file.path !== P1).map((file) => [file.path, { verdict: 'approved' as const, fingerprint: file.fingerprint, viewed: true }]),
      )
      const api = renderFiles(`/s/${SESSION_ID}/files?commit=${COMMIT_SHAS.first}`, reviewResponseFixture(reviewFixture({ files: approvedRest })), options)
      const card = await screen.findByRole('article', { name: P3 })
      expect(await screen.findByText('1 / 3')).toBeInTheDocument()
      await waitFor(() => expect(api.patchRequests.at(-1)).toBe(`/api/sessions/${SESSION_ID}/scopes/${COMMIT_SHAS.first}/files/${P3}/patch`))
      const user = userEvent.setup()
      await user.click(within(card).getByRole('button', { name: 'Approve' }))
      // Advances to the scope's next unreviewed file (the full diff's would be a different one).
      const second = await screen.findByRole('article', { name: P1 })
      expect(screen.getByText('2 / 3')).toBeInTheDocument()
      await waitFor(() => expect(api.puts.some((put) => put.review.files[P3]?.verdict === 'approved')).toBe(true))
      expect(api.puts.find((put) => put.review.files[P3]?.verdict === 'approved')?.review.files[P3]?.fingerprint).toBe(files[3]?.fingerprint)

      // The full diff is now complete, but the scope view stays instead of going to Submit.
      await user.click(within(second).getByRole('button', { name: 'Approve' }))
      await waitFor(() => expect(api.puts.some((put) => put.review.files[P1]?.verdict === 'approved')).toBe(true))
      expect(screen.queryByText('Submit page')).not.toBeInTheDocument()
      expect(screen.getByRole('article', { name: P1 })).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'ArrowRight' })
      expect(await screen.findByRole('article', { name: REVERTED })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    })

    it('drops a sha the commit list does not know and steps through the timeline with [ and ]', async () => {
      renderFiles(`/s/${SESSION_ID}/files/${P0}?mode=grid&commit=${'f'.repeat(40)}`, reviewResponseFixture(), options)
      await screen.findByRole('list', { name: 'All files' })
      await waitFor(() => expect(screen.getByRole('button', { name: /^Full diff/ })).toHaveAttribute('aria-pressed', 'true'))
      expect(grid().children).toHaveLength(files.length)
      expect(screen.getByRole('main')).not.toHaveAttribute('data-scope')

      const firstCommit = () => screen.getByRole('button', { name: `Commit ${short}: add shell breadcrumb/title helpers, wire up BasePage` })
      fireEvent.keyDown(window, { key: ']' })
      await waitFor(() => expect(firstCommit()).toHaveAttribute('aria-pressed', 'true'))
      await waitFor(() => expect(grid().children).toHaveLength(3))
      expect(screen.getByRole('main')).toHaveAttribute('data-scope', COMMIT_SHAS.first)
      fireEvent.keyDown(window, { key: '[' })
      await waitFor(() => expect(firstCommit()).toHaveAttribute('aria-pressed', 'false'))
      expect(grid().children).toHaveLength(files.length)
      expect(screen.queryByRole('article')).not.toBeInTheDocument()
    })

    it('H hides the merge commits from the strip with a toast, ] skips them, and the choice is remembered', async () => {
      const { toast } = await import('sonner')
      renderFiles(`/s/${SESSION_ID}/files/${P0}?mode=grid&commit=${COMMIT_SHAS.first}`, reviewResponseFixture(), options)
      await screen.findByRole('list', { name: 'All files' })
      expect(await screen.findByRole('button', { name: /^Merge commit/ })).toBeInTheDocument()
      fireEvent.keyDown(window, { key: 'h' })
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Merge commit/ })).not.toBeInTheDocument())
      expect(toast.info).toHaveBeenLastCalledWith('Merge commits hidden')
      expect(window.localStorage.getItem('review-dash:hide-merges')).toBe('hidden')
      fireEvent.keyDown(window, { key: ']' })
      await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('data-scope', COMMIT_SHAS.last))
      fireEvent.keyDown(window, { key: 'H' })
      expect(await screen.findByRole('button', { name: /^Merge commit/ })).toBeInTheDocument()
      expect(toast.info).toHaveBeenLastCalledWith('Merge commits shown')
    })

    it('the Full diff node clears the scope and keeps the mode', async () => {
      renderFiles(`/s/${SESSION_ID}/files?mode=grid&commit=${COMMIT_SHAS.first}`, reviewResponseFixture(), options)
      await screen.findByRole('list', { name: 'All files' })
      // The grid remounts once the scope's files arrive; click only then.
      await waitFor(() => expect(grid().children).toHaveLength(3))
      fireEvent.click(screen.getByRole('button', { name: /^Full diff/ }))
      await waitFor(() => expect(screen.getByRole('button', { name: /^Full diff/ })).toHaveAttribute('aria-pressed', 'true'))
      expect(await screen.findByRole('list', { name: 'All files' })).toBeInTheDocument()
      expect(grid().children).toHaveLength(files.length)
    })
  })

  describe('on a narrow screen', () => {
    beforeEach(() => {
      vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
      )
    })

    it('the toggle in the timeline row opens the files drawer and picking a file closes it', async () => {
      renderFiles(`/s/${SESSION_ID}/files`)
      await firstCard()
      expect(screen.queryByRole('complementary', { name: 'Files sidebar' })).not.toBeInTheDocument()
      const row = screen.getByRole('region', { name: 'Commits' })
      const toggle = within(row).getByRole('button', { name: 'Show files sidebar' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(toggle)
      const drawer = await screen.findByRole('complementary', { name: 'Files sidebar' })
      fireEvent.click(within(drawer).getByRole('treeitem', { name: /useTrial\.ts/ }))
      await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Files sidebar' })).not.toBeInTheDocument())
      expect(await screen.findByText('2 / 6')).toBeInTheDocument()
    })
  })
})
