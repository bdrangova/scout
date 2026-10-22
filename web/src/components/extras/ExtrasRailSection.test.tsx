import type { CodeReviewDetail } from '@review-dash/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRailSlot } from '@/components/spec/render-rail'
import { ExtrasPage } from '@/pages/ExtrasPage'
import { commentFixture, reviewFixture, reviewResponseFixture, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'

vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ initialize() {}, render: async () => ({ svg: '' }) }) },
}))

const CONTENTS: Record<string, string> = {
  'extras/architecture.md': '# Architecture',
  'extras/reports/report.html': '<html><body>Report</body></html>',
  'extras/sequence.mmd': 'sequenceDiagram\n A->>B: hi',
}

const detail: CodeReviewDetail = {
  ...sessionDetailFixture,
  extras: [
    { path: 'architecture.md', type: 'markdown', title: 'Architecture (markdown with a mermaid block and a very long title that wraps)' },
    { path: 'reports/report.html', type: 'html', title: 'Test report' },
    { path: 'sequence.mmd', type: 'mermaid', title: 'Add-comment sequence' },
  ],
}

describe('ExtrasRailSection', () => {
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('lists the extras with their file names and open comments; a click scrolls to the card', async () => {
    const review = reviewFixture({ comments: [commentFixture('c1', { kind: 'extra', ref: 'reports/report.html' }, 'Two cases are skipped.')], nextCommentId: 2 })
    mockReviewApi(reviewResponseFixture(review), { contents: CONTENTS })
    renderWithRailSlot(detail, <ExtrasPage />)
    const block = await screen.findByRole('region', { name: 'Extras' })
    expect(within(block).getByText('3')).toBeInTheDocument()
    const report = within(block).getByRole('button', { name: /Test report/ })
    expect(within(report).getByText('report.html')).toBeInTheDocument()
    expect(within(report).getByText('1 open comment')).toBeInTheDocument()
    expect(within(block).getByRole('button', { name: /Architecture/ })).toHaveAttribute('aria-current', 'true')

    await userEvent.setup().click(report)
    expect(report).toHaveAttribute('aria-current', 'true')
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getByRole('article', { name: 'Test report' }).parentElement)
  })

  it('renders no block without extras', async () => {
    mockReviewApi(reviewResponseFixture(reviewFixture()), { contents: CONTENTS })
    renderWithRailSlot({ ...detail, extras: [] }, <ExtrasPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Extras' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Extras' })).not.toBeInTheDocument()
  })
})
