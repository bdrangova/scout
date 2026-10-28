import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentProposal, mergeComments, prReviewCopyItems } from '@scout/shared'
import { makePrReport } from '@scout/shared/testing/pr-review'
import { makeReview, makeTree, makeManifest, makeComment } from '@scout/shared/testing/fixtures'
import { sessionDetailFixture, SESSION_ID } from '@/test/fixtures'
import { LoadedReviewProvider } from '@/state/ReviewProvider'
import { SessionContext } from '@/lib/session-context'
import { PrReviewProvider } from '@/components/prreview/PrReviewProvider'
import { apiGet, apiPost } from '@/lib/api'
import { prReviewLocationUrl } from '@/lib/pr-review-links'
import { toast } from 'sonner'
import { PrReviewSubmitPage } from './PrReviewSubmitPage'
vi.mock('@/state/useAutosave', () => ({ useAutosave: () => ({ status: 'idle', flush: async () => true }) }))
vi.mock('@/lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const tree = makeTree({ dirty: false })
const report = makePrReport(tree)
const finding = report.findings[0]!
const review = makeReview({ comments: [makeComment({ id: 'c1', body: 'My own line feedback', target: { kind: 'file', ref: tree.files[1]!.path, anchor: { side: 'old', line: 2, endLine: 4 } } })] })
review.prProposals = { [finding.id]: { ...currentProposal(report, finding, review), verdict: 'approved', body: 'Exact approved wording', notes: [{ body: 'Private note', createdAt: report.createdAt }] } }
function setup(stale = false) {
  const detail = { ...sessionDetailFixture, manifest: makeManifest({ kind: 'pr-review' }), tree: stale ? { ...tree, headSha: 'd'.repeat(40) } : tree, prReview: report }
  return render(<MemoryRouter><SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}><LoadedReviewProvider sessionId={SESSION_ID} items={tree.files} itemKind="file" response={{ review, resolutions: null, comments: mergeComments(review, null) }} reload={() => {}}><PrReviewProvider detail={detail}><PrReviewSubmitPage /></PrReviewProvider></LoadedReviewProvider></SessionContext.Provider></MemoryRouter>)
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiGet).mockResolvedValue({ review })
  vi.mocked(apiPost).mockResolvedValue({ items: prReviewCopyItems(report, tree, review) })
})
describe('PR review copy handoff', () => {
  it('makes linked copyable comments the main summary, with no duplicate approved section or Markdown preview', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Open PR #42' })).toHaveAttribute('href', report.pr.url)
    const proposed = screen.getByRole('region', { name: `Comment: ${finding.title}` })
    expect(within(proposed).getByText('Exact approved wording')).toBeInTheDocument()
    expect(within(proposed).getByRole('link', { name: /src\/a.tsx/ })).toHaveAttribute('href', prReviewLocationUrl(report.pr.url, finding.path, finding.anchor))
    expect(screen.getByRole('link', { name: /old lines 2–4/ })).toHaveAttribute('href', prReviewLocationUrl(report.pr.url, tree.files[1]!.path, { side: 'old', line: 2, endLine: 4 }))
    expect(screen.queryByRole('heading', { name: 'Approved comments' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Review summary/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Private note')).not.toBeInTheDocument()
  })
  it('copies only the chosen checked comment wording', async () => {
    const user = userEvent.setup(); const clipboard = vi.spyOn(navigator.clipboard, 'writeText')
    setup()
    await user.click(screen.getByRole('button', { name: `Copy comment: ${finding.title}` }))
    expect(apiPost).toHaveBeenCalledWith(expect.stringContaining('/pr-review/export'), expect.objectContaining({ reportRevision: expect.any(String), treeFingerprint: tree.fingerprint }))
    expect(clipboard).toHaveBeenCalledWith('Exact approved wording')
    await user.click(screen.getByRole('button', { name: `Copy comment: ${tree.files[1]!.path}` }))
    expect(clipboard).toHaveBeenLastCalledWith('My own line feedback')
  })
  it('excludes stale proposals and refuses a comment that changed during handoff', async () => {
    const user = userEvent.setup(); const clipboard = vi.spyOn(navigator.clipboard, 'writeText')
    const view = setup(true)
    expect(screen.queryByText('Exact approved wording')).not.toBeInTheDocument()
    expect(screen.getByText('My own line feedback')).toBeInTheDocument()
    view.unmount(); setup()
    vi.mocked(apiPost).mockResolvedValue({ items: [] })
    await user.click(screen.getByRole('button', { name: `Copy comment: ${finding.title}` }))
    expect(clipboard).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('This comment changed. Review its current wording before copying.')
  })
})
