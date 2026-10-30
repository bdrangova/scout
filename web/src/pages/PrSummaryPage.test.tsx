import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { mergeComments, PrReviewReportSchema, type PrReviewReport } from '@scout/shared'
import { makePrReport } from '@scout/shared/testing/pr-review'
import { makeManifest, makeReview, makeTree } from '@scout/shared/testing/fixtures'
import { RailSlotOutlet, RailSlotProvider } from '@/components/layout/RailSlot'
import { PrReviewProvider } from '@/components/prreview/PrReviewProvider'
import { SessionContext } from '@/lib/session-context'
import { LoadedReviewProvider } from '@/state/ReviewProvider'
import { SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { PrSummaryPage } from './PrSummaryPage'

vi.mock('@/state/useAutosave', () => ({ useAutosave: () => ({ status: 'idle', flush: async () => true }) }))

const tree = makeTree({ dirty: false })
const base = makePrReport(tree)
const overview: NonNullable<PrReviewReport['overview']> = {
  summary: ['Approvers can reject a change with a reason.', 'One finding: the reason is not saved.'],
  tags: ['backend', 'security', 'feature'],
  title: 'Reject with a reason',
  description: '## What\n\nAdds a reason box.',
  author: 'mira',
  headRef: 'feature/reject',
  baseRef: 'main',
  labels: ['approvals'],
  draft: true,
  openedAt: '2026-10-25T14:20:00.000Z',
  commits: 3,
  tickets: [{ key: 'QI-1', title: 'Reject reason', url: 'https://example.atlassian.net/browse/QI-1' }],
}
const review = makeReview({})

function setup(report: PrReviewReport, path = `/s/${SESSION_ID}/summary`) {
  const detail = { ...sessionDetailFixture, manifest: makeManifest({ kind: 'pr-review' }), tree, prReview: report, spec: [] }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>
        <LoadedReviewProvider sessionId={SESSION_ID} items={tree.files} itemKind="file" response={{ review, resolutions: null, comments: mergeComments(review, null) }} reload={() => {}}>
          <PrReviewProvider detail={detail}>
            <RailSlotProvider>
              <RailSlotOutlet />
              <Routes>
                <Route path="/s/:id/summary" element={<PrSummaryPage />} />
              </Routes>
            </RailSlotProvider>
          </PrReviewProvider>
        </LoadedReviewProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
}

describe('PR review Summary page', () => {
  it('leads with the summary card: bullets, tags in kind-then-area order, and the PR facts', () => {
    setup({ ...base, overview })
    const card = screen.getByRole('article', { name: 'PR summary' })
    expect(within(card).getAllByRole('listitem').map((item) => item.textContent)).toEqual(expect.arrayContaining(overview.summary))
    const tags = within(within(card).getByRole('list', { name: 'Change type' })).getAllByRole('listitem')
    expect(tags.map((tag) => tag.textContent)).toEqual(['Feature', 'Security', 'Backend'])
    expect(within(card).getByText('Draft')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'QI-1' })).toHaveAttribute('href', 'https://example.atlassian.net/browse/QI-1')
    expect(within(card).getByRole('link', { name: 'Open PR' })).toHaveAttribute('href', base.pr.url)
    expect(screen.getByRole('article', { name: 'PR description' })).toHaveTextContent('Adds a reason box.')
    expect(screen.getByRole('article', { name: 'Changed files' })).toBeInTheDocument()
  })

  it('folds a section from its chevron', async () => {
    setup({ ...base, overview })
    const files = screen.getByRole('article', { name: 'Changed files' })
    await userEvent.setup().click(within(files).getByRole('button', { name: 'Collapse Changed files' }))
    expect(within(files).queryByRole('list', { name: 'Changed files' })).not.toBeInTheDocument()
  })

  it('shows tiles in grid mode', () => {
    setup({ ...base, overview }, `/s/${SESSION_ID}/summary?mode=grid`)
    const grid = screen.getByRole('list', { name: 'Summary sections' })
    expect(within(grid).getByRole('button', { name: 'Open Reject with a reason' })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: 'Open Changed files' })).toBeInTheDocument()
  })

  it('says how to get a summary when the report has none', () => {
    setup(base)
    expect(screen.getByRole('article', { name: 'PR summary' })).toHaveTextContent('This review has no summary yet.')
    expect(screen.queryByRole('article', { name: 'PR description' })).not.toBeInTheDocument()
  })

  it('rejects tags outside the shared list and duplicate tags', () => {
    expect(PrReviewReportSchema.safeParse({ ...base, overview: { ...overview, tags: ['urgent'] } }).success).toBe(false)
    expect(PrReviewReportSchema.safeParse({ ...base, overview: { ...overview, tags: ['fix', 'fix'] } }).success).toBe(false)
    expect(PrReviewReportSchema.safeParse({ ...base, overview: { ...overview, tickets: [{ key: 'QI-1', title: null, url: 'javascript:alert(1)' }] } }).success).toBe(false)
    expect(PrReviewReportSchema.safeParse({ ...base, overview }).success).toBe(true)
  })
})
