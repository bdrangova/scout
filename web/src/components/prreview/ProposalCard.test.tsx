import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'
import { mergeComments } from '@review-dash/shared'
import { makePrReport } from '@review-dash/shared/testing/pr-review'
import { makeReview, makeTree, makeManifest } from '@review-dash/shared/testing/fixtures'
import { sessionDetailFixture, SESSION_ID } from '@/test/fixtures'
import { LoadedReviewProvider } from '@/state/ReviewProvider'
import { useReview } from '@/state/review-context'
import { ProposalCard } from './ProposalCard'
import { PrReviewProvider } from './PrReviewProvider'

vi.mock('@/state/useAutosave', () => ({ useAutosave: () => ({ status: 'idle', flush: async () => true }) }))
const tree = makeTree({ dirty: false })
const report = makePrReport(tree)
function State() {
  const { state } = useReview()
  return <output aria-label="Review state">{JSON.stringify(state)}</output>
}
function renderProposal(stale = false) {
  const review = makeReview()
  const detail = { ...sessionDetailFixture, manifest: makeManifest({ kind: 'pr-review' }), tree: stale ? { ...tree, headSha: 'd'.repeat(40) } : tree, prReview: report }
  return render(<MemoryRouter><LoadedReviewProvider sessionId={SESSION_ID} items={tree.files} itemKind="file" response={{ review, resolutions: null, comments: mergeComments(review, null) }} reload={() => {}}><PrReviewProvider detail={detail}><ProposalCard finding={report.findings[0]!} /><State /></PrReviewProvider></LoadedReviewProvider></MemoryRouter>)
}
const state = () => JSON.parse(screen.getByLabelText('Review state').textContent!)
describe('generated proposal review', () => {
  it('approves independently, clears approval after edits, rejects and preserves agent notes', async () => {
    renderProposal(); const user = userEvent.setup()
    const card = screen.getByRole('region', { name: /Suggested comment/ })
    await user.click(within(card).getByRole('button', { name: 'Approve comment' }))
    expect(state().review.prProposals.f1.verdict).toBe('approved')
    expect(state().review.files).toEqual({})
    expect(state().atEnd).toBe(false)
    const editor = within(card).getByRole('textbox', { name: 'Recommended comment for f1' })
    await user.clear(editor); await user.type(editor, 'My edited wording')
    expect(state().review.prProposals.f1).toMatchObject({ verdict: 'none', body: 'My edited wording' })
    await user.click(within(card).getByRole('button', { name: 'Approve comment' }))
    await user.click(within(card).getByRole('button', { name: 'Comment on suggestion' }))
    await user.type(within(card).getByRole('textbox', { name: /Note for the reviewer agent/ }), 'Internal verification note')
    await user.click(within(card).getByRole('button', { name: 'Comment' }))
    expect(state().review.prProposals.f1.verdict).toBe('approved')
    expect(state().review.prProposals.f1.notes[0].body).toBe('Internal verification note')
    expect(state().review.comments).toEqual([])
    await user.click(within(card).getByRole('button', { name: 'Reject comment' }))
    expect(state().review.prProposals.f1.verdict).toBe('rejected')
  })
  it('cannot approve empty text or a stale report', async () => {
    const view = renderProposal(); const user = userEvent.setup()
    await user.clear(screen.getByRole('textbox', { name: 'Recommended comment for f1' }))
    expect(screen.getByRole('button', { name: 'Approve comment' })).toBeDisabled()
    view.unmount(); renderProposal(true)
    expect(screen.getByRole('button', { name: 'Approve comment' })).toBeDisabled()
    expect(screen.getByText(/Refresh before approving/)).toBeInTheDocument()
  })
})
