import { mergeComments } from '@review-dash/shared'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { commentFixture, fp, resolutionsFixture, reviewFixture, SESSION_ID, sessionDetailFixture, treeFixture } from '@/test/fixtures'
import { OpenComments } from './OpenComments'

const FILE = treeFixture.files[0]
const FILE2 = treeFixture.files[1]
if (!FILE || !FILE2) throw new Error('fixture too small')

const review = reviewFixture({
  files: {
    [FILE.path]: { verdict: 'rejected', fingerprint: FILE.fingerprint, viewed: true },
    // Approved on an older fingerprint: the chip must say "commented", not "approved".
    [FILE2.path]: { verdict: 'approved', fingerprint: fp('stale'), viewed: true },
  },
  comments: [
    commentFixture('c1', { kind: 'file', ref: FILE.path }, 'Day count is off by one.'),
    commentFixture('c2', { kind: 'evidence', ref: 'dismiss.webm' }, 'The modal opens too early.', { timestampSec: 42 }),
    commentFixture('c3', { kind: 'extra', ref: 'architecture.md' }, 'Missing the provider node.'),
    commentFixture('c4', { kind: 'file', ref: FILE2.path }, 'Rename this hook.', { sentAt: '2026-09-26T17:30:00.000Z' }),
    commentFixture('c5', { kind: 'spec', ref: 'jira.md' }, 'AC 3 is not covered.'),
    commentFixture('c6', { kind: 'file', ref: 'src/gone.ts' }, 'This file left the tree.'),
  ],
})

const resolutions = resolutionsFixture(
  { c4: { status: 'resolved', note: 'Renamed to useTrialState.', at: '2026-09-26T18:00:00.000Z', files: [] } },
  '2026-09-26T18:00:00.000Z',
)

function renderList() {
  const onReopen = vi.fn()
  render(
    <MemoryRouter initialEntries={[`/s/${SESSION_ID}/submit`]}>
      <OpenComments
        comments={mergeComments(review, resolutions)}
        review={review}
        detail={sessionDetailFixture}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onResolve={vi.fn()}
        onReopen={onReopen}
      />
    </MemoryRouter>,
  )
  return { onReopen }
}

describe('OpenComments', () => {
  it('groups the open comments under Files, Evidence, Spec and Extras by path, with the effective verdict summary', () => {
    renderList()
    expect(screen.getByText('5 open')).toHaveTextContent('5 open')
    expect(screen.getByText('0 approved · 1 rejected · 1 commented · 4 not reviewed')).toBeInTheDocument()
    const files = screen.getByLabelText('TrialBar.tsx')
    expect(within(files).getByText('rejected')).toBeInTheDocument()
    expect(within(files).getByText('Day count is off by one.')).toBeInTheDocument()
    expect(within(files).getByRole('link').getAttribute('href')).toMatch(/\/files\/src\/main\/client\/trial\/TrialBar\.tsx$/)
    const evidence = screen.getByLabelText('Dismissing the bar')
    expect(within(evidence).getByText('at 0:42')).toBeInTheDocument()
    expect(within(evidence).getByRole('link').getAttribute('href')).toMatch(/\/evidence\/dismiss\.webm$/)
    expect(screen.getByLabelText('Architecture')).toBeInTheDocument()
    const spec = screen.getByLabelText('QI-15472')
    expect(within(spec).getByText('AC 3 is not covered.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: 'Spec' })).toBeInTheDocument()
    // A comment on a file that is no longer in the tree is listed under its full path.
    expect(within(screen.getByLabelText('src/gone.ts')).getByText('commented')).toBeInTheDocument()
  })

  it('hides resolved comments until "Show 1 resolved" and offers Reopen with the note', () => {
    const { onReopen } = renderList()
    expect(screen.queryByText('Rename this hook.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 resolved' }))
    const resolved = screen.getByLabelText('Resolved comment c4')
    expect(within(resolved).getByText('Renamed to useTrialState.')).toBeInTheDocument()
    expect(within(resolved).getByText('Claude Code:')).toBeInTheDocument()
    fireEvent.click(within(resolved).getByRole('button', { name: 'Reopen' }))
    expect(onReopen).toHaveBeenCalledWith('c4')
    fireEvent.click(screen.getByRole('button', { name: 'Hide 1 resolved' }))
    expect(screen.queryByText('Rename this hook.')).not.toBeInTheDocument()
  })
})
