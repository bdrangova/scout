import { mergeComments, type PrResolutions } from '@scout/shared'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { makePrResolution } from '@scout/shared/testing/fixtures'
import { PrCommentsContext } from '@/state/pr-comments-context'
import { makePrComment, prCommentsValue } from '@/test/pr-comments'
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

function prResolutions(comments: PrResolutions['comments']): PrResolutions {
  return { schemaVersion: 2, sessionId: SESSION_ID, updatedAt: '2026-10-01T10:00:00.000Z', comments }
}

function draft(kind: 'instruction' | 'reply', body: string, postedAt: string | null = null) {
  return { body, kind, editedAt: '2026-10-01T10:00:00.000Z', postedAt }
}

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
    expect(screen.getByLabelText('5 open')).toHaveTextContent('5')
    expect(screen.getByLabelText('1 resolved')).toHaveTextContent('1')
    expect(screen.getByText('0 approved · 1 rejected · 1 commented · 4 not reviewed')).toBeInTheDocument()
    const files = screen.getByLabelText('TrialBar.tsx')
    expect(within(files).getByText('Changes requested')).toBeInTheDocument()
    expect(within(files).getByText('Day count is off by one.')).toBeInTheDocument()
    expect(within(files).getByRole('link').getAttribute('href')).toMatch(/\/files\/src\/main\/client\/trial\/TrialBar\.tsx$/)
    const evidence = screen.getByLabelText('Dismissing the bar')
    expect(within(evidence).getByText('at 0:42')).toBeInTheDocument()
    expect(within(evidence).getByRole('link').getAttribute('href')).toMatch(/\/evidence\/dismiss\.webm$/)
    expect(screen.getByLabelText('Architecture')).toBeInTheDocument()
    const spec = screen.getByLabelText('QI-15472')
    expect(within(spec).getByText('AC 3 is not covered.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Spec' })).toBeInTheDocument()
    // A comment on a file that is no longer in the tree is listed under its full path.
    expect(within(screen.getByLabelText('src/gone.ts')).getByText('Commented')).toBeInTheDocument()
  })

  it('shows the empty line when there are no comments at all', () => {
    const empty = reviewFixture()
    render(
      <MemoryRouter initialEntries={[`/s/${SESSION_ID}/submit`]}>
        <OpenComments comments={[]} review={empty} detail={sessionDetailFixture} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} onReopen={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('0 open')).toBeInTheDocument()
    expect(screen.queryByLabelText(/resolved$/)).not.toBeInTheDocument()
    expect(screen.getByText(/No comments yet/)).toBeInTheDocument()
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

  describe('GitHub PR comments', () => {
    const prValue = prCommentsValue(
      [
        makePrComment({ githubId: 1, path: FILE.path, line: 3, body: 'Open PR note.' }),
        makePrComment({ githubId: 2, path: FILE.path, line: 4, body: 'Done PR note.' }),
        makePrComment({ githubId: 3, path: FILE.path, line: 5, body: 'Declined PR note.' }),
        makePrComment({ githubId: 4, kind: 'general', path: null, line: null, body: 'General PR note.' }),
      ],
      { resolutions: prResolutions({ rc2: makePrResolution({ status: 'addressed', note: 'Fixed.' }), rc3: makePrResolution({ status: 'declined', note: 'Not needed.' }) }) },
    )

    function renderWithPr() {
      render(
        <MemoryRouter initialEntries={[`/s/${SESSION_ID}/submit`]}>
          <PrCommentsContext.Provider value={prValue}>
            <OpenComments comments={mergeComments(review, resolutions)} review={review} detail={sessionDetailFixture} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} onReopen={vi.fn()} />
          </PrCommentsContext.Provider>
        </MemoryRouter>,
      )
    }

    it('lists open PR threads next to the session comments, counts them, and hides the resolved ones until expanded', () => {
      renderWithPr()
      expect(screen.getByLabelText('7 open')).toBeInTheDocument()
      expect(screen.getByLabelText('3 resolved')).toBeInTheDocument()
      const files = screen.getByLabelText('TrialBar.tsx')
      expect(within(files).getByText('Day count is off by one.')).toBeInTheDocument()
      expect(within(files).getByText('Open PR note.')).toBeInTheDocument()
      expect(screen.getByText('General PR note.')).toBeInTheDocument()
      expect(screen.queryByText('Done PR note.')).not.toBeInTheDocument()
      expect(screen.queryByText('Declined PR note.')).not.toBeInTheDocument()
      expect(screen.queryByText('In last send')).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'GitHub comments' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Show 3 resolved' }))
      const done = document.querySelector('[data-pr-comment="rc2"]')
      const declined = document.querySelector('[data-pr-comment="rc3"]')
      expect(done?.querySelector('[data-pr-tint]')).toHaveClass('bg-ok-bg/40')
      expect(declined?.querySelector('[data-pr-tint]')).toHaveClass('bg-err-bg/40')
      expect(within(done as HTMLElement).getByText('Addressed')).toHaveClass('sr-only')
    })

    describe('answered threads with a reply to review', () => {
      const comments = [
        makePrComment({ githubId: 11, path: FILE.path, line: 3, body: 'Proposal pending.' }),
        makePrComment({ githubId: 12, path: FILE.path, line: 4, body: 'Draft unposted.' }),
        makePrComment({ githubId: 13, path: FILE.path, line: 5, body: 'Draft posted.' }),
        makePrComment({ githubId: 14, path: FILE.path, line: 6, body: 'Plain answered.' }),
      ]
      const resolutions = prResolutions({
        rc11: makePrResolution({ status: 'addressed', note: 'Done 11.', proposedReply: 'Fixed in abc.' }),
        rc12: makePrResolution({ status: 'addressed', note: 'Done 12.' }),
        rc13: makePrResolution({ status: 'declined', note: 'Done 13.' }),
        rc14: makePrResolution({ status: 'addressed', note: 'Done 14.' }),
      })
      const drafts = {
        rc12: draft('reply', 'Thanks, fixed.'),
        rc13: draft('reply', 'Not needed.', '2026-10-02T10:00:00.000Z'),
      }

      function renderAnswered() {
        render(
          <MemoryRouter initialEntries={[`/s/${SESSION_ID}/submit`]}>
            <PrCommentsContext.Provider value={prCommentsValue(comments, { resolutions, drafts })}>
              <OpenComments comments={[]} review={review} detail={sessionDetailFixture} onEdit={vi.fn()} onDelete={vi.fn()} onResolve={vi.fn()} onReopen={vi.fn()} />
            </PrCommentsContext.Provider>
          </MemoryRouter>,
        )
      }

      it('keeps a proposed or unposted reply visible, collapses a posted one, and counts only open threads as open', () => {
        renderAnswered()
        expect(screen.getByText('Proposal pending.')).toBeInTheDocument()
        expect(screen.getByText('Draft unposted.')).toBeInTheDocument()
        expect(screen.queryByText('Draft posted.')).not.toBeInTheDocument()
        expect(screen.queryByText('Plain answered.')).not.toBeInTheDocument()
        expect(screen.getByLabelText('0 open')).toBeInTheDocument()
        expect(screen.getByLabelText('4 resolved')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Show 2 resolved' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Show 2 resolved' }))
        expect(screen.getByText('Draft posted.')).toBeInTheDocument()
        expect(screen.getByText('Plain answered.')).toBeInTheDocument()
      })
    })
  })
})
