import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/lib/session-context'
import { commentFixture, LOADED_REVIEW_UPDATED_AT, reviewFixture, reviewResponseFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { ReviewProvider } from './ReviewProvider'
import { useReview } from './review-context'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

const F0 = sessionDetailFixture.tree.files[0]
const F1 = sessionDetailFixture.tree.files[1]
if (!F0 || !F1) throw new Error('fixture too small')
const P0 = F0.path
const P1 = F1.path
const FP1 = F1.fingerprint

function Probe() {
  const { state, dispatch, comments, progress, draftFor, setDraft, setVerdict } = useReview()
  return (
    <div>
      {/* `fingerprint: null` lets the reducer pin the verdict to the tree's fingerprint. */}
      <button onClick={() => dispatch({ type: 'SET_VERDICT', path: P0, verdict: 'approved', fingerprint: null })}>approve first</button>
      <button onClick={() => dispatch({ type: 'SET_VERDICT', path: P1, verdict: 'approved', fingerprint: FP1 })}>approve second</button>
      <button onClick={() => dispatch({ type: 'ADD_COMMENT', target: { kind: 'overall', ref: null }, body: `note ${comments.length + 1}` })}>
        comment
      </button>
      <button onClick={() => setDraft(P0, ' Looks fine, rename x. ')}>type draft</button>
      <button onClick={() => setVerdict(P0, 'approved', null)}>approve with draft</button>
      <button onClick={() => setVerdict(P0, 'rejected', null)}>reject with draft</button>
      <output data-testid="draft">{draftFor(P0)}</output>
      <output data-testid="pending">{state.pendingReject ?? 'none'}</output>
      <output data-testid="verdict">{state.review.files[P0]?.verdict ?? 'none'}</output>
      <output data-testid="progress">
        {progress.reviewed}/{progress.total}
      </output>
      <ul>
        {comments.map((comment) => (
          <li key={comment.id}>{comment.body}</li>
        ))}
      </ul>
    </div>
  )
}

function renderProvider(response = reviewResponseFixture()) {
  const api = mockReviewApi(response)
  render(
    <SessionContext.Provider value={{ sessionId: SESSION_ID, detail: sessionDetailFixture, reload: () => {} }}>
      <ReviewProvider>
        <Probe />
      </ReviewProvider>
    </SessionContext.Provider>,
  )
  return api
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('ReviewProvider + useAutosave', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  // Each test re-stubs fetch; un-stubbing only at the end keeps the unmount keepalive save mocked.
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('loads the review and PUTs a verdict pinned to the tree fingerprint immediately, with the loaded updatedAt as base', async () => {
    const api = renderProvider()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'approve first' }))

    await waitFor(() => expect(api.puts).toHaveLength(1))
    const first = api.puts[0]
    expect(first?.baseUpdatedAt).toBe(LOADED_REVIEW_UPDATED_AT)
    expect(first?.review.files[P0]).toEqual({ verdict: 'approved', fingerprint: F0.fingerprint, viewed: true })
    expect(screen.getByTestId('verdict')).toHaveTextContent('approved')
    expect(screen.getByTestId('progress')).toHaveTextContent('1/6')

    await user.click(screen.getByRole('button', { name: 'approve second' }))
    await waitFor(() => expect(api.puts).toHaveLength(2))
    expect(api.puts[1]?.baseUpdatedAt).toBe('2026-09-26T18:00:01.000Z')
    expect(api.puts[1]?.review.files[P1]?.fingerprint).toBe(F1.fingerprint)
    expect(screen.getByTestId('progress')).toHaveTextContent('2/6')
  })

  it('approving with a typed draft saves the comment with the verdict and clears the draft', async () => {
    const api = renderProvider()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'type draft' }))
    expect(screen.getByTestId('draft')).toHaveTextContent('Looks fine, rename x.')

    await user.click(screen.getByRole('button', { name: 'approve with draft' }))
    expect(screen.getByTestId('verdict')).toHaveTextContent('approved')
    expect(screen.getByText('Looks fine, rename x.')).toBeInTheDocument()
    expect(screen.getByTestId('draft')).toBeEmptyDOMElement()
    await waitFor(() => expect(api.puts).toHaveLength(1))
    expect(api.puts[0]?.review.files[P0]?.verdict).toBe('approved')
    expect(api.puts[0]?.review.comments.map((comment) => [comment.target.ref, comment.body])).toEqual([[P0, 'Looks fine, rename x.']])
  })

  it('rejecting with a typed draft is final at once; without one it waits for a comment', async () => {
    renderProvider()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'reject with draft' }))
    expect(screen.getByTestId('pending')).toHaveTextContent(P0)
    expect(screen.getByTestId('verdict')).toHaveTextContent('none')

    await user.click(screen.getByRole('button', { name: 'type draft' }))
    await user.click(screen.getByRole('button', { name: 'reject with draft' }))
    expect(screen.getByTestId('pending')).toHaveTextContent('none')
    expect(screen.getByTestId('verdict')).toHaveTextContent('rejected')
    expect(screen.getByText('Looks fine, rename x.')).toBeInTheDocument()
  })

  it('a comment alone counts the file as reviewed', async () => {
    renderProvider(
      reviewResponseFixture(
        reviewFixture({ comments: [commentFixture('c1', { kind: 'file', ref: P1 }, 'Question')], nextCommentId: 2 }),
      ),
    )
    expect(await screen.findByTestId('progress')).toHaveTextContent('1/6')
  })

  it('debounces two quick comments into one PUT', async () => {
    const api = renderProvider()
    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: 'comment' })
    await user.click(button)
    await user.click(button)
    expect(api.puts).toHaveLength(0)
    await wait(450)
    expect(api.puts).toHaveLength(1)
    expect(api.puts[0]?.review.comments.map((comment) => comment.body)).toEqual(['note 1', 'note 2'])
    expect(screen.getByText('note 2')).toBeInTheDocument()
  })

  it('reloads the server copy and toasts on a 409, then uses its updatedAt as the base', async () => {
    const api = renderProvider()
    const current = reviewFixture({
      comments: [commentFixture('c1', { kind: 'overall', ref: null }, 'From disk')],
      nextCommentId: 2,
      updatedAt: '2026-09-26T17:05:00.000Z',
    })
    api.queuePut({ ok: false, kind: 'conflict', current })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'approve first' }))

    expect(await screen.findByText('From disk')).toBeInTheDocument()
    expect(screen.getByTestId('verdict')).toHaveTextContent('none')
    expect(toast.warning).toHaveBeenCalledWith('Review reloaded from disk', expect.anything())

    await user.click(screen.getByRole('button', { name: 'approve first' }))
    await waitFor(() => expect(api.puts).toHaveLength(2))
    expect(api.puts[1]?.baseUpdatedAt).toBe('2026-09-26T17:05:00.000Z')
    expect(api.puts[1]?.review.comments[0]?.body).toBe('From disk')
  })

  it('toasts other errors and retries on the next change', async () => {
    const api = renderProvider()
    api.queuePut({ ok: false, kind: 'error', status: 500, error: 'disk full' })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'approve first' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the review", expect.anything()))
    expect(api.puts).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'comment' }))
    await waitFor(() => expect(api.puts).toHaveLength(2), { timeout: 1500 })
    expect(api.puts[1]?.review.files[P0]?.verdict).toBe('approved')
    expect(api.puts[1]?.review.comments).toHaveLength(1)
  })
})
