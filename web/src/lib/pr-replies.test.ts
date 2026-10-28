import { buildPrCommentsResponse, type PrReplies, type PrResolutions } from '@scout/shared'
import { makePrComment, makePrComments, makePrResolution } from '@scout/shared/testing/fixtures'
import { describe, expect, it } from 'vitest'
import { hasReplyBox, needsReplyReview, queuedReplyCounts, replyKindFor } from './pr-replies'
import { groupPrThreads } from './pr-threads'

const SESSION = makePrComments().sessionId
const T = '2026-10-05T10:00:00.000Z'

function threads(statuses: Record<number, 'addressed' | 'declined'>, proposals: Record<number, string>, replies: PrReplies['replies'], extra = {}) {
  const comments = [1, 2, 3, 4].map((githubId) => makePrComment({ githubId, ...(githubId === 4 ? extra : {}) }))
  const resolutions: PrResolutions = {
    schemaVersion: 2,
    sessionId: SESSION,
    updatedAt: T,
    comments: Object.fromEntries(Object.entries(statuses).map(([id, status]) => [`rc${id}`, makePrResolution({ status, proposedReply: proposals[Number(id)] })])),
  }
  const drafts: PrReplies = { schemaVersion: 2, sessionId: SESSION, updatedAt: T, replies }
  return groupPrThreads(buildPrCommentsResponse(makePrComments(comments), resolutions, null, drafts).comments)
}

const draft = (kind: 'instruction' | 'reply', postedAt: string | null = null) => ({ body: 'text', kind, editedAt: T, postedAt })

describe('PR reply helpers', () => {
  const list = threads({ 2: 'addressed', 3: 'declined' }, { 2: 'Fixed.' }, { rc1: draft('instruction'), rc3: draft('reply'), rc4: draft('instruction') }, { outdated: true })
  const byId = (id: string) => {
    const found = list.find((thread) => thread.root.id === id)
    if (!found) throw new Error(`no ${id}`)
    return found
  }

  it('derives the kind from the status', () => {
    expect(replyKindFor(byId('rc1').root)).toBe('instruction')
    expect(replyKindFor(byId('rc2').root)).toBe('reply')
    expect(replyKindFor(byId('rc4').root)).toBeNull()
  })

  it('shows a box for open threads and answered ones with a proposal or draft, never outdated', () => {
    expect(hasReplyBox(byId('rc1').root)).toBe(true)
    expect(hasReplyBox(byId('rc2').root)).toBe(true)
    expect(hasReplyBox(byId('rc3').root)).toBe(true)
    expect(hasReplyBox(byId('rc4').root)).toBe(false)
  })

  it('needs review for an answered thread with a proposal or an unposted draft', () => {
    expect(needsReplyReview(byId('rc1'))).toBe(false)
    expect(needsReplyReview(byId('rc2'))).toBe(true)
    expect(needsReplyReview(byId('rc3'))).toBe(true)
  })

  it('does not need review once posted', () => {
    const posted = threads({ 3: 'declined' }, {}, { rc3: draft('reply', T) })
    expect(needsReplyReview(posted.find((thread) => thread.root.id === 'rc3') ?? byId('rc3'))).toBe(false)
  })

  it('counts the drafts a Submit would carry by kind, skipping proposals and posted ones', () => {
    expect(queuedReplyCounts(list)).toEqual({ instructions: 1, replies: 1 })
    expect(queuedReplyCounts(threads({ 3: 'declined' }, {}, { rc3: draft('reply', T) }))).toEqual({ instructions: 0, replies: 0 })
  })
})
