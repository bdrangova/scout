import type { CodeReviewDetail } from '@review-dash/shared'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRailSlot } from '@/components/spec/render-rail'
import { SpecPage } from '@/pages/SpecPage'
import { commentFixture, reviewFixture, reviewResponseFixture, sessionDetailFixture } from '@/test/fixtures'
import { mockReviewApi } from '@/test/mock-api'

vi.mock('@streamdown/mermaid', () => ({
  mermaid: { name: 'mermaid', type: 'diagram', language: 'mermaid', getMermaid: () => ({ initialize() {}, render: async () => ({ svg: '' }) }) },
}))

const LONG = 'A heading that is far too long for a 296 pixel rail so it has to be cut short with an ellipsis'
const CONTENTS: Record<string, string> = {
  'spec/jira.md': '# QI-15472: Trial bar\n\n## Description\n\ntext\n\n## Acceptance criteria\n\n1. one',
  'spec/plan.md': `# Plan\n\n## Approach\n\n\`\`\`\n## Not a heading\n\`\`\`\n\n## ${LONG}`,
  'spec/design.html': '<html><body><h2>Hidden in a frame</h2></body></html>',
}

const detail: CodeReviewDetail = {
  ...sessionDetailFixture,
  spec: [
    { path: 'jira.md', type: 'jira', title: 'QI-15472: Trial bar', url: null, sourcePath: null, capturedAt: null },
    { path: 'plan.md', type: 'markdown', title: 'Implementation plan', url: null, sourcePath: null, capturedAt: null },
    { path: 'design.html', type: 'artifact', title: 'Trial bar design', url: null, sourcePath: null, capturedAt: null },
  ],
}

describe('SpecRailSection', () => {
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
  })
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  async function renderSpecShell(spec = detail.spec, comments = reviewFixture()) {
    mockReviewApi(reviewResponseFixture(comments), { contents: CONTENTS })
    renderWithRailSlot({ ...detail, spec }, <SpecPage />)
    return screen.findByRole('region', { name: 'Spec' })
  }

  it('lists the sources with their headings nested, and drops the page-header chip row', async () => {
    const block = await renderSpecShell()
    expect(within(block).getByRole('heading', { level: 2, name: 'Spec' })).toBeInTheDocument()
    expect(within(block).getByText('sources')).toBeInTheDocument()
    expect(within(block).getByRole('button', { name: /QI-15472: Trial bar/ })).toBeInTheDocument()
    expect(await within(block).findByRole('button', { name: 'Description' })).toBeInTheDocument()
    expect(within(block).getByRole('button', { name: 'Acceptance criteria' })).toBeInTheDocument()
    expect(within(block).getByRole('button', { name: 'Approach' })).toBeInTheDocument()
    expect(within(block).queryByRole('button', { name: 'Not a heading' })).not.toBeInTheDocument()
    expect(within(block).queryByRole('button', { name: 'Hidden in a frame' })).not.toBeInTheDocument()
    expect(within(block).getByRole('button', { name: LONG })).toHaveAttribute('title', LONG)
    expect(screen.queryByRole('group', { name: /exported artifact/ })).not.toBeInTheDocument()
  })

  it('shows the open comments of a source and marks the first source as current', async () => {
    const review = reviewFixture({ comments: [commentFixture('c1', { kind: 'spec', ref: 'plan.md' }, 'Step 2 is missing.')], nextCommentId: 2 })
    const block = await renderSpecShell(detail.spec, review)
    const plan = await within(block).findByRole('button', { name: /Implementation plan/ })
    expect(within(plan).getByText('1 open comment')).toBeInTheDocument()
    expect(within(block).getByRole('button', { name: /QI-15472: Trial bar/ })).toHaveAttribute('aria-current', 'true')
  })

  it('selects a source and scrolls to its card; a heading scrolls to that heading', async () => {
    const block = await renderSpecShell()
    const user = userEvent.setup()
    const plan = await within(block).findByRole('button', { name: /Implementation plan/ })
    await user.click(plan)
    expect(plan).toHaveAttribute('aria-current', 'true')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    await screen.findByRole('heading', { level: 2, name: 'Approach' })
    await user.click(within(block).getByRole('button', { name: 'Approach' }))
    expect(within(block).getByRole('button', { name: 'Approach' })).toHaveAttribute('aria-current', 'true')
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getByRole('heading', { level: 2, name: 'Approach' }))
  })

  it('renders no block without sources', async () => {
    mockReviewApi(reviewResponseFixture(reviewFixture()), { contents: CONTENTS })
    renderWithRailSlot({ ...detail, spec: [] }, <SpecPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Spec' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Spec' })).not.toBeInTheDocument()
  })
})
