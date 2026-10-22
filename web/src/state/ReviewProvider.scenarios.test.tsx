import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { draftKey } from '@/lib/comment-drafts'
import { SessionContext } from '@/lib/session-context'
import { reviewResponseFixture, SESSION_ID, testRunDetailFixture, withChangedScenario } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'
import { ReviewProvider } from './ReviewProvider'
import { useReview } from './review-context'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

const [first, second] = testRunDetailFixture.scenarios
if (!first || !second) throw new Error('fixture too small')
const S1 = { id: first.id, fingerprint: first.fingerprint }
const S2 = { id: second.id, fingerprint: second.fingerprint }

function Probe() {
  const { state, dispatch, progress, items, itemKind, setDraft, draftFor, setVerdict, unsavedDrafts, comments } = useReview()
  const key = draftKey({ kind: 'scenario', ref: S2.id })
  return (
    <div>
      <button onClick={() => dispatch({ type: 'SET_VERDICT', path: S1.id, verdict: 'approved', fingerprint: null })}>approve s1</button>
      <button onClick={() => setDraft(key, 'Wrong banner copy')}>type s2 draft</button>
      <button onClick={() => setVerdict(S2.id, 'rejected', S2.fingerprint)}>reject s2</button>
      <output data-testid="kind">{itemKind}</output>
      <output data-testid="items">{items.map((item) => item.path).join(',')}</output>
      <output data-testid="progress">
        {progress.reviewed}/{progress.total}
      </output>
      <output data-testid="verdict-s1">{state.review.files[S1.id]?.verdict ?? 'none'}</output>
      <output data-testid="draft">{draftFor(key)}</output>
      <output data-testid="unsaved">{unsavedDrafts.map((draft) => `${draft.kind}:${draft.ref}`).join(',')}</output>
      <output data-testid="comments">{comments.map((comment) => `${comment.target.kind}:${comment.target.ref}:${comment.body}`).join('|')}</output>
    </div>
  )
}

function renderProvider(detail = testRunDetailFixture, review = reviewResponseFixture()) {
  const api = mockReviewApi(review)
  render(
    <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>
      <ReviewProvider>
        <Probe />
      </ReviewProvider>
    </SessionContext.Provider>,
  )
  return api
}

describe('ReviewProvider with a test run', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('takes the scenarios as the items, keyed by scenario id', async () => {
    renderProvider()
    expect(await screen.findByTestId('kind')).toHaveTextContent('scenario')
    expect(screen.getByTestId('items')).toHaveTextContent('s1-pass,s2-fail,s3-gap')
    expect(screen.getByTestId('progress')).toHaveTextContent('0/3')
  })

  it('pins a verdict to the scenario fingerprint and autosaves it under the scenario id', async () => {
    const api = renderProvider()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'approve s1' }))
    await waitFor(() => expect(api.puts).toHaveLength(1))
    expect(api.puts[0]?.review.files[S1.id]).toEqual({ verdict: 'approved', fingerprint: S1.fingerprint, viewed: true })
    expect(screen.getByTestId('verdict-s1')).toHaveTextContent('approved')
    expect(screen.getByTestId('progress')).toHaveTextContent('1/3')
  })

  it('sends a typed draft along with a reject as a scenario comment', async () => {
    const api = renderProvider()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'type s2 draft' }))
    expect(screen.getByTestId('unsaved')).toHaveTextContent('scenario:s2-fail')
    await user.click(screen.getByRole('button', { name: 'reject s2' }))
    expect(screen.getByTestId('comments')).toHaveTextContent('scenario:s2-fail:Wrong banner copy')
    expect(screen.getByTestId('draft')).toBeEmptyDOMElement()
    await waitFor(() => expect(api.puts).toHaveLength(1))
    expect(api.puts[0]?.review.files[S2.id]?.verdict).toBe('rejected')
    expect(api.puts[0]?.review.comments.map((comment) => [comment.target.kind, comment.target.ref])).toEqual([['scenario', 's2-fail']])
    expect(screen.getByTestId('progress')).toHaveTextContent('1/3')
  })

  it('drops a verdict from the progress once the scenario changed on disk', async () => {
    const review = reviewResponseFixture({
      ...reviewResponseFixture().review,
      files: { [S2.id]: { verdict: 'approved', fingerprint: S2.fingerprint, viewed: true } },
    })
    renderProvider(withChangedScenario(testRunDetailFixture, S2.id), review)
    expect(await screen.findByTestId('progress')).toHaveTextContent('0/3')
  })
})
