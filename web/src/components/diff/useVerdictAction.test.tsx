import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeComments, type Verdict } from '@review-dash/shared'
import { makeReview, makeTreeFile, makeComment } from '@review-dash/shared/testing/fixtures'
import { LoadedReviewProvider } from '@/state/ReviewProvider'
import { useReview } from '@/state/review-context'
import { clearVerdictUndo, undoLastVerdict, useVerdictAction } from './useVerdictAction'
vi.mock('@/state/useAutosave', () => ({ useAutosave: () => ({ status: 'idle', flush: async () => true }) }))
vi.mock('sonner', async () => (await import('@/test/mock-sonner')).sonnerModuleMock())
const file = makeTreeFile()
function Controls() {
  const choose = useVerdictAction()
  const { state, draftFor, setDraft } = useReview()
  return <><button onClick={() => choose(file.path, 'approved', file.fingerprint)}>Approve</button><button onClick={() => choose(file.path, 'rejected', file.fingerprint)}>Reject</button><button onClick={() => choose(file.path, 'approved', file.fingerprint, undefined, false)}>Swipe approve</button><input aria-label="Draft" value={draftFor(file.path)} onChange={(e) => setDraft(file.path, e.target.value)} /><output aria-label="State">{JSON.stringify(state)}</output></>
}
function setup(verdict: Verdict = 'none', stale = false) {
  const review = makeReview({ files: { [file.path]: { verdict, fingerprint: verdict === 'none' ? null : stale ? 'f'.repeat(16) : file.fingerprint, viewed: true } }, comments: [makeComment({ body: 'Keep my feedback' })], ui: { mode: 'swipe', currentFile: file.path, section: 'files' } })
  render(<LoadedReviewProvider sessionId={review.sessionId} items={[file]} itemKind="file" response={{ review, resolutions: null, comments: mergeComments(review, null) }} reload={() => {}}><Controls /></LoadedReviewProvider>)
}
const state = () => JSON.parse(screen.getByLabelText('State').textContent!)
afterEach(clearVerdictUndo)
describe('shared verdict toggles', () => {
  it.each(['approved', 'rejected'] as const)('clears %s, keeps feedback and draft, stays on the file and supports Undo', async (verdict) => {
    setup(verdict); const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'Draft' }), 'Keep my unadded draft')
    await user.click(screen.getByRole('button', { name: verdict === 'approved' ? 'Approve' : 'Reject' }))
    expect(state().review.files[file.path]).toMatchObject({ verdict: 'none', fingerprint: null })
    expect(state().review.ui.currentFile).toBe(file.path); expect(state().atEnd).toBe(false)
    expect(state().review.comments).toHaveLength(1); expect(screen.getByRole('textbox')).toHaveValue('Keep my unadded draft')
    act(() => { expect(undoLastVerdict()).toBe(true) })
    expect(state().review.files[file.path].verdict).toBe(verdict)
  })
  it('does not clear an obsolete approval on changed content', async () => {
    setup('approved', true); await userEvent.setup().click(screen.getByRole('button', { name: 'Approve' }))
    expect(state().review.files[file.path]).toMatchObject({ verdict: 'approved', fingerprint: file.fingerprint })
  })
  it('cancels a pending rejection when clicked again', async () => {
    setup(); const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(state().pendingReject).toBe(file.path)
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    expect(state().pendingReject).toBeNull(); expect(state().review.files[file.path].verdict).toBe('none')
  })
  it('keeps directional swipes as set actions', async () => {
    setup('approved'); await userEvent.setup().click(screen.getByRole('button', { name: 'Swipe approve' }))
    expect(state().review.files[file.path].verdict).toBe('approved')
  })
})
