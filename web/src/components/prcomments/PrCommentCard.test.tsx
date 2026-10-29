import { buildPrCommentsResponse } from '@scout/shared'
import { makePrComment, makePrComments, makePrResolution } from '@scout/shared/testing/fixtures'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { groupPrThreads } from '@/lib/pr-threads'
import { PrCommentCard } from './PrCommentCard'
import { isLongBody } from './pr-format'

function thread(overrides = {}, resolution?: ReturnType<typeof makePrResolution>, reply = false) {
  const comments = [makePrComment({ githubId: 1, ...overrides })]
  if (reply) comments.push(makePrComment({ githubId: 2, inReplyTo: 'rc1', threadId: 'rc1', body: 'I agree.', author: { login: 'dan', isBot: false, kind: 'human' } }))
  const resolutions = resolution ? { schemaVersion: 2 as const, sessionId: makePrComments().sessionId, updatedAt: resolution.at, comments: { rc1: resolution } } : null
  const [first] = groupPrThreads(buildPrCommentsResponse(makePrComments(comments, { trustedAuthors: ['maya', 'dan'] }), resolutions, null).comments)
  if (!first) throw new Error('no thread')
  return first
}

function renderCard(...args: Parameters<typeof thread>) {
  render(
    <ul>
      <PrCommentCard thread={thread(...args)} />
    </ul>,
  )
}

describe('PrCommentCard', () => {
  it('shows the author, status word and a link to GitHub', () => {
    renderCard({ body: 'nit: **rename** this.' })
    const card = screen.getByRole('listitem', { name: /GitHub comment rc1, open/ })
    expect(within(card).getByText('maya')).toBeInTheDocument()
    expect(within(card).getByText('Open')).not.toHaveClass('sr-only')
    expect(card.querySelector('[data-pr-tint]')).toBeNull()
    expect(within(card).getByText('rename')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /View maya's comment on GitHub/ })).toHaveAttribute('href', 'https://github.com/acme/app/pull/482#discussion_r1')
  })

  it('marks Copilot and bots with a word, and a person without one', () => {
    renderCard({ author: { login: 'Copilot', isBot: true, kind: 'copilot' } })
    expect(screen.getByText('Copilot', { selector: '[data-slot="tag"]' })).toBeInTheDocument()
  })

  it('shows the agent note and the commit for an addressed comment, in green with the word for screen readers only', () => {
    renderCard({}, makePrResolution({ status: 'addressed', note: 'Renamed it.', commitSha: 'abcdef1234567890' }))
    const card = screen.getByRole('listitem', { name: /rc1, addressed/ })
    expect(card.querySelector('[data-pr-tint="addressed"]')).toHaveClass('bg-ok-bg/40')
    expect(within(card).getByText('Addressed')).toHaveClass('sr-only')
    expect(within(card).queryByText('In last send')).not.toBeInTheDocument()
    expect(within(card).getByText(/Renamed it\./)).toBeInTheDocument()
    expect(within(card).getByText('abcdef1')).toBeInTheDocument()
  })

  it('says why a declined comment was declined', () => {
    renderCard({}, makePrResolution({ status: 'declined', note: 'Tracked in OPS-12.' }))
    expect(screen.getByText('Declined')).toHaveClass('sr-only')
    expect(document.querySelector('[data-pr-tint="declined"]')).toHaveClass('bg-err-bg/40')
    expect(screen.getByText(/Tracked in OPS-12\./)).toBeInTheDocument()
  })

  it('tells outdated from resolved on GitHub', () => {
    renderCard({ resolvedOnGitHub: true })
    expect(screen.getByText('Resolved on GitHub')).toBeInTheDocument()
  })

  it('nests the replies under the root', () => {
    renderCard({}, undefined, true)
    const replies = screen.getByRole('list', { name: /Replies to maya's comment/ })
    expect(within(replies).getByText('I agree.')).toBeInTheDocument()
  })

  it('collapses a long body behind Show more and expands it', async () => {
    const body = Array.from({ length: 12 }, (_, index) => `line ${index}`).join('\n\n')
    expect(isLongBody(body)).toBe(true)
    renderCard({ body })
    const toggle = screen.getByRole('button', { name: /Show more of maya's comment/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: /Show less of maya's comment/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not offer a reply box', () => {
    renderCard({})
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('folds when the author name is clicked too', async () => {
    renderCard({ body: 'nit: **rename** this.' })
    await userEvent.click(screen.getByText('maya'))
    expect(screen.getByRole('button', { name: "Expand maya's comment" })).toHaveAttribute('aria-expanded', 'false')
  })

  it('folds to the author row and a one-line preview, and unfolds again', async () => {
    renderCard({ body: 'nit: **rename** this.' }, undefined, true)
    await userEvent.click(screen.getByRole('button', { name: "Collapse maya's comment" }))
    expect(screen.queryByRole('list', { name: /Replies to/ })).not.toBeInTheDocument()
    expect(screen.getByText('maya')).toBeInTheDocument()
    expect(screen.getByText('nit: rename this. · 1 reply')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: "Expand maya's comment" }))
    expect(screen.getByRole('list', { name: /Replies to/ })).toBeInTheDocument()
  })
})
