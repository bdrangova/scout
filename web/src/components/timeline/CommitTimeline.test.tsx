import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { COMMIT_SHAS, makeCommit, makeCommitList, sha } from '@/test/fixtures'
import { formatAbsoluteDate, truncateSubject } from './commit-format'
import { CommitTimeline, type CommitTimelineProps } from './CommitTimeline'

const totals = { files: 6, additions: 272, deletions: 51 }

/** The open tooltip's popup (base-ui renders it in a portal once the trigger is hovered or focused). */
async function tooltipContent(): Promise<HTMLElement> {
  return waitFor(() => {
    const popup = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')
    if (!popup) throw new Error('tooltip not open')
    return popup
  })
}

function renderTimeline(overrides: Partial<CommitTimelineProps> = {}) {
  const onSelect = vi.fn<(scope: string | null) => void>()
  const props: CommitTimelineProps = { list: makeCommitList(), loading: false, error: null, totals, selected: null, onSelect, ...overrides }
  const view = render(<CommitTimeline {...props} />)
  return { onSelect, rerender: (next: Partial<CommitTimelineProps>) => view.rerender(<CommitTimeline {...props} {...next} />) }
}

describe('CommitTimeline', () => {
  it('shows the Full diff node first, one node per commit oldest first, the uncommitted node and the ahead count', () => {
    renderTimeline()
    const strip = screen.getByTestId('commit-strip')
    const buttons = within(strip).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Full diff: 6 files +272 −51',
      `Commit ${COMMIT_SHAS.first.slice(0, 7)}: add shell breadcrumb/title helpers, wire up BasePage`,
      `Merge commit ${COMMIT_SHAS.merge.slice(0, 7)}: Merge branch 'master' into trial-bar`,
      `Commit ${COMMIT_SHAS.last.slice(0, 7)}: Fix the day count`,
      'Uncommitted changes: 2 files',
    ])
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons[0]).toHaveAttribute('data-scope', 'full')
    expect(buttons[0]?.querySelector('.bg-foreground')).not.toBeNull()
    expect(within(strip).getByText('Full diff')).toHaveClass('font-semibold')
    expect(within(strip).getByText('6 files +272 −51')).toBeInTheDocument()
    expect(within(strip).getByText(truncateSubject('add shell breadcrumb/title helpers, wire up BasePage'))).toBeInTheDocument()
    expect(within(strip).getByText('2 files')).toBeInTheDocument()
    // No branch chip and no "behind" arrow at zero: just the ahead count, naming the remote in its tooltip.
    expect(screen.queryByText(/origin\//)).not.toBeInTheDocument()
    expect(screen.getByLabelText('1 commit not on origin/bojana-QI-15472-trial-bar')).toHaveTextContent('1')
    expect(screen.queryByLabelText(/not here$/)).not.toBeInTheDocument()
  })

  it('shows the behind arrow once the remote has commits this branch lacks', () => {
    renderTimeline({ list: makeCommitList({ remote: { ref: 'origin/x', ahead: 0, behind: 2 } }) })
    expect(screen.getByLabelText('0 commits not on origin/x')).toHaveTextContent('0')
    expect(screen.getByLabelText('2 commits on origin/x not here')).toHaveTextContent('2')
  })

  it('draws the line from Full diff through the commits to Uncommitted, dashed into unpushed ones', () => {
    renderTimeline()
    const items = [...screen.getByTestId('commit-strip').querySelectorAll('li')]
    const segments = items.map((item) => [...item.querySelectorAll('span[aria-hidden].border-t')].map((segment) => (segment.classList.contains('border-dashed') ? 'dashed' : 'solid')))
    // Full diff → c1 solid; c1 → merge solid; merge → c3 (unpushed) dashed; c3 → uncommitted dashed; nothing after.
    expect(segments).toEqual([['solid'], ['solid', 'solid'], ['solid', 'dashed'], ['dashed', 'dashed'], ['dashed']])
  })

  it('renders what is passed as leading at the left of the row and marks the strip busy while a scope loads', () => {
    const { rerender } = renderTimeline({ leading: <button type="button">Files</button>, scopeLoad: { loading: true, error: null, reload: () => {} } })
    const section = screen.getByRole('region', { name: 'Commits' })
    expect(section.firstElementChild).toHaveTextContent('Files')
    expect(screen.getByTestId('commit-strip')).toHaveAttribute('aria-busy', 'true')
    const reload = vi.fn()
    rerender({ scopeLoad: { loading: false, error: new Error('GET failed with 500'), reload } })
    expect(screen.getByTestId('commit-strip')).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't load this scope")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('marks pushed and unpushed commits on each node and draws the merge node differently', () => {
    renderTimeline()
    expect(screen.getAllByRole('img', { name: 'Pushed to origin/bojana-QI-15472-trial-bar' })).toHaveLength(2)
    expect(screen.getAllByRole('img', { name: 'Not pushed yet' })).toHaveLength(1)
    const merge = screen.getByRole('button', { name: /^Merge commit/ })
    expect(merge.querySelector('.lucide-git-merge')).not.toBeNull()
    const plain = screen.getByRole('button', { name: /^Commit .*Fix the day count/ })
    expect(plain.querySelector('.lucide-git-merge')).toBeNull()
  })

  it('selects a node on click and Full diff clears the selection; the selected node is filled', () => {
    const { onSelect, rerender } = renderTimeline()
    fireEvent.click(screen.getByRole('button', { name: /Fix the day count/ }))
    expect(onSelect).toHaveBeenCalledWith(COMMIT_SHAS.last)
    fireEvent.click(screen.getByRole('button', { name: 'Uncommitted changes: 2 files' }))
    expect(onSelect).toHaveBeenCalledWith('uncommitted')

    rerender({ selected: COMMIT_SHAS.last })
    const node = screen.getByRole('button', { name: /Fix the day count/ })
    expect(node).toHaveAttribute('aria-pressed', 'true')
    expect(node.querySelector('.bg-foreground')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^Full diff/ })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: /^Full diff/ }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('shows the full subject, author, dates, stats and the push state in the tooltip', async () => {
    renderTimeline()
    const user = userEvent.setup()
    await user.hover(screen.getByRole('button', { name: /Fix the day count/ }))
    const tooltip = await tooltipContent()
    expect(tooltip).toHaveTextContent('Fix the day count')
    expect(tooltip).toHaveTextContent('bojana')
    expect(tooltip).toHaveTextContent(formatAbsoluteDate('2026-09-26T10:00:00.000Z'))
    expect(tooltip).toHaveTextContent('2 files +20 −3')
    expect(tooltip).toHaveTextContent('Not pushed yet')
    await user.unhover(screen.getByRole('button', { name: /Fix the day count/ }))
    await user.hover(screen.getByRole('button', { name: /^Merge commit/ }))
    const mergeTip = await tooltipContent()
    expect(mergeTip).toHaveTextContent('merge')
    expect(mergeTip).toHaveTextContent(`${COMMIT_SHAS.first.slice(0, 7)}, ${sha('master').slice(0, 7)}`)
    expect(mergeTip).toHaveTextContent('On origin/bojana-QI-15472-trial-bar')
  })

  it('shows only a muted icon when the branch has no remote and nothing is pushed', () => {
    const list = makeCommitList({ remote: { ref: null, ahead: 3, behind: 0 }, commits: [makeCommit({ sha: COMMIT_SHAS.first, pushed: false })] })
    renderTimeline({ list })
    const icon = screen.getByRole('img', { name: 'No remote branch: nothing has been pushed' })
    expect(icon.querySelector('.lucide-cloud-off')).not.toBeNull()
    expect(icon).toHaveTextContent('')
    expect(screen.getAllByRole('img', { name: 'Not pushed yet' })).toHaveLength(1)
  })

  it('renders only the Full diff node with no commits and no uncommitted changes, and an inline error when the list failed', () => {
    const { rerender } = renderTimeline({ list: makeCommitList({ commits: [], uncommitted: null }) })
    expect(within(screen.getByTestId('commit-strip')).getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByText('No commits since the base')).not.toBeInTheDocument()
    rerender({ list: null, error: new Error('GET /sessions/x/commits failed with 422: repo missing') })
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't load the commits: GET /sessions/x/commits failed with 422: repo missing")
    expect(screen.getByRole('button', { name: /^Full diff/ })).toBeInTheDocument()
  })

  it('leaves hidden merge commits out, except the selected one, and keeps the line styles of the remaining nodes', () => {
    const { rerender } = renderTimeline({ hideMerges: true })
    const strip = screen.getByTestId('commit-strip')
    expect(within(strip).queryByRole('button', { name: /^Merge commit/ })).not.toBeInTheDocument()
    expect(within(strip).getAllByRole('button')).toHaveLength(4)
    const segments = [...strip.querySelectorAll('li')].map((item) => [...item.querySelectorAll('span[aria-hidden].border-t')].map((segment) => (segment.classList.contains('border-dashed') ? 'dashed' : 'solid')))
    // Full diff → c1 solid; c1 → c3 (unpushed) dashed; c3 → uncommitted dashed.
    expect(segments).toEqual([['solid'], ['solid', 'dashed'], ['dashed', 'dashed'], ['dashed']])
    rerender({ hideMerges: true, selected: COMMIT_SHAS.merge })
    expect(within(strip).getByRole('button', { name: /^Merge commit/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(strip).getAllByRole('button')).toHaveLength(5)
  })

  it('renders a long history without choking', () => {
    const commits = Array.from({ length: 150 }, (_, index) => makeCommit({ sha: sha(`many-${index}`), subject: `Commit number ${index}` }))
    const start = performance.now()
    renderTimeline({ list: makeCommitList({ commits }) })
    expect(screen.getAllByRole('button', { name: /^Commit/ })).toHaveLength(150)
    expect(performance.now() - start).toBeLessThan(4000)
    const items = screen.getByTestId('commit-strip').querySelectorAll('li')
    expect(items).toHaveLength(152)
    // Every column has the same width, so the segments meet at the centres.
    expect(new Set([...items].map((item) => item.className)).size).toBe(1)
  })
})
