import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { mergeComments } from '@scout/shared'
import { makePrReport } from '@scout/shared/testing/pr-review'
import { makeComment, makeManifest, makeReview, makeTree } from '@scout/shared/testing/fixtures'
import { RailSlotOutlet, RailSlotProvider } from '@/components/layout/RailSlot'
import { PrReviewProvider } from '@/components/prreview/PrReviewProvider'
import { SessionContext } from '@/lib/session-context'
import { LoadedReviewProvider } from '@/state/ReviewProvider'
import { SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { EvidencePage } from './EvidencePage'

vi.mock('@/state/useAutosave', () => ({ useAutosave: () => ({ status: 'idle', flush: async () => true }) }))

const tree = makeTree({ dirty: false })
const base = makePrReport(tree)
const first = base.findings[0]!
const second = {
  ...first,
  id: 'f2',
  severity: 'medium' as const,
  title: 'The Upgrade button sits 2px low',
  path: tree.files[1]!.path,
  anchor: { side: 'new' as const, line: 3 },
  reproduction: {
    ...first.reproduction,
    status: 'reproduced' as const,
    limitation: null,
    steps: [{ id: 's1', instruction: 'Open the dashboard.' }, { id: 's2', instruction: 'Compare the button with the dismiss control.' }],
    evidence: [{ path: 'offset.png', kind: 'screenshot' as const, caption: 'Button 2px low', stepId: 's2', capturedAt: base.createdAt, revision: tree.headSha }],
  },
}
const report = { ...base, findings: [first, second] }
const review = makeReview({ comments: [makeComment({ id: 'c1', body: 'Guard the plan change', target: { kind: 'file', ref: first.path, anchor: { side: 'new', line: 1 } } })] })

function setup(path = `/s/${SESSION_ID}/evidence`) {
  const detail = { ...sessionDetailFixture, manifest: makeManifest({ kind: 'pr-review' }), tree, prReview: report }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionContext.Provider value={{ sessionId: SESSION_ID, detail, reload: () => {} }}>
        <LoadedReviewProvider sessionId={SESSION_ID} items={tree.files} itemKind="file" response={{ review, resolutions: null, comments: mergeComments(review, null) }} reload={() => {}}>
          <PrReviewProvider detail={detail}>
            <RailSlotProvider>
              <RailSlotOutlet />
              <Routes>
                <Route path="/s/:id/evidence/*" element={<EvidencePage />} />
              </Routes>
            </RailSlotProvider>
          </PrReviewProvider>
        </LoadedReviewProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
}

describe('PR review Evidence page', () => {
  it('opens on the first finding with its steps, outcome and the comments on its lines', async () => {
    setup()
    const card = await screen.findByRole('article', { name: first.title })
    expect(within(card).getByText('Submit a declined payment.')).toBeInTheDocument()
    expect(within(card).getByText('The plan remains unchanged.')).toBeInTheDocument()
    expect(within(card).getByText('Payment credentials are unavailable.')).toBeInTheDocument()
    expect(within(card).getByText('Guard the plan change')).toBeInTheDocument()
    expect(within(card).getByRole('textbox', { name: `Recommended comment for ${first.id}` })).toHaveValue(first.body)
    const list = screen.getByRole('list', { name: 'Findings' })
    expect(within(list).getAllByRole('button').map((row) => row.getAttribute('title'))).toEqual([`${first.title} · high`, `${second.title} · medium`])
  })

  it('moves between findings with the arrows, approves the suggestion with A and opens evidence full screen', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('article', { name: first.title })
    await user.keyboard('{ArrowRight}')
    const card = await screen.findByRole('article', { name: second.title })
    expect(within(card).getByText('2')).toBeInTheDocument()

    await user.keyboard('a')
    expect(within(card).getByRole('button', { name: 'Approve comment' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('list', { name: 'Findings' })).getByRole('img', { name: 'Suggestion approved' })).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Open screenshot: Button 2px low' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Compare the button with the dismiss control.')
  })

  it('shows every finding as a tile in grid mode, filters by decision and opens one in the deck', async () => {
    const user = userEvent.setup()
    setup(`/s/${SESSION_ID}/evidence?mode=grid`)
    const grid = await screen.findByRole('list', { name: 'All findings' })
    expect(within(grid).getAllByRole('listitem')).toHaveLength(2)
    expect(within(grid).getByText('No evidence')).toBeInTheDocument()

    within(grid).getAllByRole('listitem')[1]!.focus()
    await user.keyboard('a')
    expect(within(grid).getByRole('img', { name: 'Suggestion approved' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Approved/ }))
    expect(within(screen.getByRole('list', { name: 'All findings' })).getAllByRole('listitem')).toHaveLength(1)

    await user.click(screen.getByText(second.title, { selector: 'strong' }))
    expect(await screen.findByRole('article', { name: second.title })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'All findings' })).not.toBeInTheDocument()
  })
})
