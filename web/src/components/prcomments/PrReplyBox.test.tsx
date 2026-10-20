import type { PrReplyDraft, PrResolutions } from '@review-dash/shared'
import { makePrResolution } from '@review-dash/shared/testing/fixtures'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '@/lib/api'
import { PrCommentsContext } from '@/state/pr-comments-context'
import { SESSION_ID } from '@/test/fixtures'
import { makePrComment, okSaveReply, prCommentsValue } from '@/test/pr-comments'
import { PrCommentCard } from './PrCommentCard'

function resolutions(comments: PrResolutions['comments']): PrResolutions {
  return { schemaVersion: 2, sessionId: SESSION_ID, updatedAt: '2026-10-01T10:00:00.000Z', comments }
}

function draft(kind: PrReplyDraft['kind'], body: string, postedAt: string | null = null): PrReplyDraft {
  return { body, kind, editedAt: '2026-10-05T10:00:00.000Z', postedAt }
}

interface Options {
  comments?: Parameters<typeof prCommentsValue>[0]
  drafts?: Record<string, PrReplyDraft>
  resolutions?: PrResolutions
}

function renderCard({ comments = [makePrComment({ githubId: 1 })], drafts, resolutions: res }: Options = {}) {
  const saveReply = okSaveReply()
  const value = prCommentsValue(comments, { saveReply, drafts, resolutions: res })
  const [thread] = value.threads
  if (!thread) throw new Error('no thread')
  render(
    <PrCommentsContext.Provider value={value}>
      <ul>
        <PrCommentCard thread={thread} />
      </ul>
    </PrCommentsContext.Provider>,
  )
  return { saveReply }
}

describe('PrReplyBox', () => {
  it('offers a collapsed instruction trigger on an open thread, saves the typed text after a pause and shows Saved', async () => {
    const user = userEvent.setup()
    const { saveReply } = renderCard()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "Instruction for Claude about maya's comment" }))
    expect(screen.getByText('Instruction for Claude · sent with your next submit')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: "Instruction for Claude about maya's comment" }), 'Rename it to dayCount')
    expect(saveReply).not.toHaveBeenCalled()
    await waitFor(() => expect(saveReply).toHaveBeenCalledWith('rc1', 'Rename it to dayCount'))
    expect(saveReply).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('shows an existing instruction draft in the box with a Queued chip', () => {
    renderCard({ drafts: { rc1: draft('instruction', 'Use the helper.') } })
    expect(screen.getByRole('textbox', { name: /Instruction for Claude/ })).toHaveValue('Use the helper.')
    expect(screen.getByText('Queued')).toBeInTheDocument()
  })

  it('saves on blur at once and on Escape leaves the box', async () => {
    const user = userEvent.setup()
    const { saveReply } = renderCard({ drafts: { rc1: draft('instruction', 'a') } })
    const box = screen.getByRole('textbox')
    await user.type(box, 'b')
    await user.keyboard('{Escape}')
    expect(box).not.toHaveFocus()
    expect(saveReply).toHaveBeenCalledWith('rc1', 'ab')
  })

  it('saves a blank text (deleting the draft) when the user clears the box', async () => {
    const user = userEvent.setup()
    const { saveReply } = renderCard({ drafts: { rc1: draft('instruction', 'a') } })
    await user.clear(screen.getByRole('textbox'))
    await waitFor(() => expect(saveReply).toHaveBeenCalledWith('rc1', ''))
  })

  it('shows an untouched proposal as not queued and saves it as the draft only on "Use this reply"', async () => {
    const user = userEvent.setup()
    const { saveReply } = renderCard({
      comments: [makePrComment({ githubId: 1 })],
      resolutions: resolutions({ rc1: makePrResolution({ status: 'addressed', note: 'Done.', proposedReply: 'Fixed in abc1234.' }) }),
    })
    expect(screen.getByText('Proposed reply from Claude')).toBeInTheDocument()
    expect(screen.getByText(/Not queued yet/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: "Reply to maya's comment" })).toHaveValue('Fixed in abc1234.')
    expect(screen.queryByText('Queued')).not.toBeInTheDocument()
    await user.click(screen.getByRole('textbox'))
    await user.tab()
    expect(saveReply).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Use this reply' }))
    expect(saveReply).toHaveBeenCalledWith('rc1', 'Fixed in abc1234.', 'reply')
  })

  it('sends no kind with an autosave of typed text', async () => {
    const user = userEvent.setup()
    const { saveReply } = renderCard({ drafts: { rc1: draft('instruction', 'a') } })
    await user.type(screen.getByRole('textbox'), 'b')
    await waitFor(() => expect(saveReply).toHaveBeenCalledTimes(1))
    expect(saveReply.mock.calls[0]).toEqual(['rc1', 'ab'])
  })

  it('shows a stale instruction on an answered thread as an unqueued instruction with a notice and Clear, and clearing deletes it', async () => {
    const user = userEvent.setup()
    const { saveReply } = renderCard({
      resolutions: resolutions({ rc1: makePrResolution({ status: 'addressed', note: 'Done.', proposedReply: 'Kept.' }) }),
      drafts: { rc1: draft('instruction', 'skip, we want 5000') },
    })
    expect(screen.getByRole('textbox', { name: /Instruction for Claude/ })).toHaveValue('skip, we want 5000')
    expect(screen.getByRole('alert')).toHaveTextContent('This comment changed since you wrote this instruction. It was not posted. Clear it to use the proposed reply.')
    expect(screen.queryByText('Queued')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use this reply' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(saveReply).toHaveBeenCalledWith('rc1', '')
  })

  it('on a 409 pr-reply-kind-mismatch keeps the text, shows the notice and does not retry', async () => {
    const user = userEvent.setup()
    const saveReply = vi.fn(() => Promise.reject(new ApiRequestError('PUT', '/x', 409, { error: 'changed', reason: 'pr-reply-kind-mismatch' })))
    const value = prCommentsValue([makePrComment({ githubId: 1 })], { saveReply, drafts: { rc1: draft('instruction', 'a') } })
    const [thread] = value.threads
    if (!thread) throw new Error('no thread')
    render(
      <PrCommentsContext.Provider value={value}>
        <ul>
          <PrCommentCard thread={thread} />
        </ul>
      </PrCommentsContext.Provider>,
    )
    await user.type(screen.getByRole('textbox'), 'b')
    expect(await screen.findByRole('alert')).toHaveTextContent('It was not posted')
    expect(screen.getByText('Not saved')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('ab')
    await user.tab()
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(saveReply).toHaveBeenCalledTimes(1)
  })

  it('autosaves an edited proposal as a reply draft', async () => {
    const user = userEvent.setup()
    const { saveReply } = renderCard({
      resolutions: resolutions({ rc1: makePrResolution({ status: 'declined', note: 'No.', proposedReply: 'Not now' }) }),
    })
    await user.type(screen.getByRole('textbox'), '.')
    await waitFor(() => expect(saveReply).toHaveBeenCalledWith('rc1', 'Not now.'))
  })

  it('shows an unposted reply draft with its kind label and Queued chip, no proposal button', () => {
    renderCard({
      resolutions: resolutions({ rc1: makePrResolution({ status: 'addressed', note: 'Done.', proposedReply: 'Fixed.' }) }),
      drafts: { rc1: draft('reply', 'Edited reply') },
    })
    expect(screen.getByRole('textbox', { name: "Reply to maya's comment" })).toHaveValue('Edited reply')
    expect(screen.getByText('Reply to post on GitHub · posted when you submit')).toBeInTheDocument()
    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use this reply' })).not.toBeInTheDocument()
  })

  it('shows a posted reply read-only with the time', () => {
    renderCard({
      resolutions: resolutions({ rc1: makePrResolution({ status: 'addressed', note: 'Done.' }) }),
      drafts: { rc1: draft('reply', 'Posted text', '2026-10-05T12:00:00.000Z') },
    })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('Posted to GitHub')).toBeInTheDocument()
    expect(screen.getByRole('blockquote', { name: 'Posted reply' })).toHaveTextContent('Posted text')
    expect(document.querySelector('time[datetime="2026-10-05T12:00:00.000Z"]')).not.toBeNull()
  })

  it('has no box on an answered thread without a proposal or draft, on an outdated thread, or on replies', () => {
    renderCard({ resolutions: resolutions({ rc1: makePrResolution({ status: 'addressed', note: 'Done.' }) }) })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Tell Claude what to do…')).not.toBeInTheDocument()
  })

  it('has no box on an outdated thread', () => {
    renderCard({ comments: [makePrComment({ githubId: 1, outdated: true })], drafts: { rc1: draft('instruction', 'x') } })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Tell Claude what to do…')).not.toBeInTheDocument()
  })

  it('keeps the box for an untrusted comment, with its tag', () => {
    renderCard({ comments: [makePrComment({ githubId: 1, authorAssociation: 'FIRST_TIME_CONTRIBUTOR', author: { login: 'eve', isBot: false, kind: 'human' } })] })
    expect(screen.getByText('Not sent to agent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Instruction for Claude about eve's comment" })).toBeInTheDocument()
  })
})
