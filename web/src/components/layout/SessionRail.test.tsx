import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { commentFixture, reviewFixture, SESSION_ID, sessionDetailFixture } from '@/test/fixtures'
import { renderShell } from '@/test/render-shell'
import { RailSection } from './RailSlot'

const FILES = sessionDetailFixture.tree.files
const verdict = (index: number, value: 'approved' | 'rejected') => {
  const file = FILES[index]
  if (!file) throw new Error('fixture too small')
  return [file.path, { verdict: value, fingerprint: file.fingerprint, viewed: true }] as const
}
const rail = () => screen.getByRole('complementary', { name: 'Session panel' })

describe('SessionRail', () => {
  beforeEach(() => window.localStorage.clear())

  describe('identity', () => {
    it('is roomy on the other pages: tickets, title, repository, the diff stats and both branches', () => {
      renderShell(`/s/${SESSION_ID}/spec`)
      const side = within(rail())
      expect(side.getByRole('group', { name: 'Tickets' })).toBeInTheDocument()
      expect(side.getByRole('heading', { level: 2, name: sessionDetailFixture.manifest.title })).toBeInTheDocument()
      expect(side.getByLabelText('Repository qbdvision')).toBeInTheDocument()
      expect(side.getByText('+2,556')).toBeInTheDocument()
      expect(side.getByText('into')).toBeInTheDocument()
      expect(side.getByText('from')).toBeInTheDocument()
      expect(side.getByTitle(/^Base branch/)).toHaveTextContent('origin/main')
    })

    it('lists every ticket on one scrolling row, with the collapse chevron in front of them', () => {
      renderShell(`/s/${SESSION_ID}/spec`)
      const side = within(rail())
      const tickets = side.getByRole('group', { name: 'Tickets' })
      expect(tickets).toHaveClass('overflow-x-auto')
      expect(tickets).not.toHaveClass('flex-wrap')
      expect(within(tickets).getAllByText(/^[A-Z]+-\d+$/)).toHaveLength(sessionDetailFixture.manifest.tickets.length)
      const chevron = side.getByRole('button', { name: 'Collapse session details' })
      expect(chevron.compareDocumentPosition(tickets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('is one line on Files by default', () => {
      renderShell(`/s/${SESSION_ID}/files`)
      const side = within(rail())
      expect(side.getByText(sessionDetailFixture.manifest.title)).toBeInTheDocument()
      expect(side.queryByRole('group', { name: 'Tickets' })).not.toBeInTheDocument()
      expect(side.getByRole('button', { name: 'Expand session details' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('remembers the density per group and starts from each group’s own', () => {
      window.localStorage.setItem('review-dash:rail-density:other', 'compact')
      renderShell(`/s/${SESSION_ID}/spec`)
      const side = within(rail())
      expect(side.queryByRole('group', { name: 'Tickets' })).not.toBeInTheDocument()
      fireEvent.click(side.getByRole('button', { name: 'Expand session details' }))
      expect(side.getByRole('group', { name: 'Tickets' })).toBeInTheDocument()
      expect(window.localStorage.getItem('review-dash:rail-density:other')).toBe('roomy')
      expect(window.localStorage.getItem('review-dash:rail-density:files')).toBeNull()
      fireEvent.click(side.getByRole('button', { name: 'Collapse session details' }))
      expect(side.queryByRole('group', { name: 'Tickets' })).not.toBeInTheDocument()
    })

    it('warns when the repository is on another branch than the session was published on', () => {
      renderShell(`/s/${SESSION_ID}/spec`, { detail: { ...sessionDetailFixture, tree: { ...sessionDetailFixture.tree, branch: 'other-branch' } } })
      expect(within(rail()).getByText('Branch changed')).toBeInTheDocument()
    })
  })

  describe('review state', () => {
    it('says awaiting review with the empty bar and no suggestion before the first verdict', () => {
      renderShell(`/s/${SESSION_ID}/spec`)
      const side = within(rail())
      expect(side.getByText('0/6')).toBeInTheDocument()
      expect(side.getByRole('img', { name: '0 approved · 0 rejected · 0 commented · 6 not reviewed' })).toBeInTheDocument()
      expect(side.getByRole('status')).toHaveTextContent('Awaiting review')
      expect(side.getByText('Suggested decision')).toBeInTheDocument()
      expect(side.getByText('none yet')).toBeInTheDocument()
      expect(side.getByText('6 not reviewed')).toBeInTheDocument()
    })

    it('splits the bar by verdict, counts open comments as commented and suggests requesting changes after a rejection', () => {
      const comment = commentFixture('c1', { kind: 'file', ref: FILES[2]?.path ?? null }, 'Hmm')
      renderShell(`/s/${SESSION_ID}/spec`, { review: reviewFixture({ files: Object.fromEntries([verdict(0, 'approved'), verdict(1, 'rejected')]), comments: [comment] }) })
      const side = within(rail())
      expect(side.getByText('3/6')).toBeInTheDocument()
      expect(side.getByRole('img', { name: '1 approved · 1 rejected · 1 commented · 3 not reviewed' })).toBeInTheDocument()
      expect(side.getByText('Request changes')).toBeInTheDocument()
      expect(side.getByText('In progress · 3 of 6')).toBeInTheDocument()
    })

    it('suggests approving once every file is approved and links the ready notice to Submit', () => {
      renderShell(`/s/${SESSION_ID}/spec`, { review: reviewFixture({ files: Object.fromEntries(FILES.map((_, index) => verdict(index, 'approved'))) }) })
      const side = within(rail())
      expect(side.getByText('Decision')).toBeInTheDocument()
      expect(side.getByText('Approve')).toBeInTheDocument()
      expect(side.getByRole('link', { name: /Ready to submit.*go to Submit/ })).toHaveAttribute('href', `/s/${SESSION_ID}/submit`)
    })

    it('keeps the counts and the notice in compact, with the decision beside the notice', () => {
      renderShell(`/s/${SESSION_ID}/files`, { review: reviewFixture({ files: Object.fromEntries([verdict(0, 'rejected')]) }) })
      const side = within(rail())
      expect(side.getByText('1/6')).toBeInTheDocument()
      expect(side.getByText('1 rejected')).toBeInTheDocument()
      expect(side.queryByText('Suggested decision')).not.toBeInTheDocument()
      expect(side.queryByText('5 not reviewed')).not.toBeInTheDocument()
      expect(side.getByText('Request changes')).toBeInTheDocument()
    })

    it('has no suggestion while Claude Code is working', () => {
      renderShell(`/s/${SESSION_ID}/spec`, { detail: { ...sessionDetailFixture, activeRunId: 'run-20260926180000-ab12' }, review: reviewFixture({ files: Object.fromEntries([verdict(0, 'rejected')]) }) })
      expect(within(rail()).queryByText('Suggested decision')).not.toBeInTheDocument()
      expect(within(rail()).getByLabelText('Agent working')).toHaveAttribute('data-run', 'working')
      expect(within(rail()).getByTitle(/In progress|Awaiting review|Changes sent/)).toBeInTheDocument()
    })
  })

  describe('visibility', () => {
    it('is hidden by the bar toggle and the choice is remembered', () => {
      const { bar } = renderShell(`/s/${SESSION_ID}/spec`)
      fireEvent.click(within(bar).getByRole('button', { name: 'Hide sidebar' }))
      expect(screen.queryByRole('complementary', { name: 'Session panel' })).not.toBeInTheDocument()
      expect(window.localStorage.getItem('review-dash:rail')).toBe('closed')
      expect(within(bar).getByRole('button', { name: 'Show sidebar' })).toHaveTextContent('0/6')
    })

    it('starts closed when it was left closed', () => {
      window.localStorage.setItem('review-dash:rail', 'closed')
      renderShell(`/s/${SESSION_ID}/submit`)
      expect(screen.queryByRole('complementary', { name: 'Session panel' })).not.toBeInTheDocument()
    })
  })

  describe('section block', () => {
    it('renders what the page puts in a RailSection, under the review state, and nothing for a page that puts nothing', () => {
      renderShell(`/s/${SESSION_ID}/spec`, {
        page: (
          <RailSection>
            <p>Spec sources</p>
          </RailSection>
        ),
      })
      const block = within(rail()).getByText('Spec sources')
      expect(within(rail()).getByRole('region', { name: 'Review state' }).compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('leaves the slot empty when the page has no block', () => {
      renderShell(`/s/${SESSION_ID}/extras`)
      expect(rail().querySelector('[data-slot="rail-section-slot"]')).toBeEmptyDOMElement()
    })

    it('renders nothing while the rail is closed', () => {
      window.localStorage.setItem('review-dash:rail', 'closed')
      renderShell(`/s/${SESSION_ID}/spec`, {
        page: (
          <RailSection>
            <p>Spec sources</p>
          </RailSection>
        ),
      })
      expect(screen.queryByText('Spec sources')).not.toBeInTheDocument()
    })
  })
})
