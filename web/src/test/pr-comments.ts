import { buildPrCommentsResponse, type PrComment, type PrReplies, type PrReplyDraft, type PrResolutions, type PutPrReplyResponse } from '@review-dash/shared'
import { makePrComment, makePrComments } from '@review-dash/shared/testing/fixtures'
import { vi, type Mock } from 'vitest'
import { prCommentsValueFrom, type PrCommentsValue } from '@/state/pr-comments-context'
import { SESSION_ID } from './fixtures'

export { makePrComment }

export interface PrCommentsValueOptions {
  resolutions?: PrResolutions | null
  /** The user's drafts by thread root id, as `review/pr-replies.json` holds them. */
  drafts?: Record<string, PrReplyDraft>
  saveReply?: PrCommentsValue['saveReply']
  flushReplies?: PrCommentsValue['flushReplies']
}

/** A save that answers like the server: the text back as an unposted draft (blank: none). */
export function okSaveReply(kind: PrReplyDraft['kind'] = 'instruction'): Mock<PrCommentsValue['saveReply']> {
  return vi.fn(
    (commentId: string, body: string): Promise<PutPrReplyResponse> =>
      Promise.resolve({
        commentId,
        draft: body.trim() === '' ? null : { body, kind, editedAt: '2026-10-05T10:00:00.000Z', postedAt: null },
        updatedAt: '2026-10-05T10:00:00.000Z',
      }),
  )
}

/** The PR comments context value for a list of comments (and the agent's answers, the user's drafts), as the provider would build it. */
export function prCommentsValue(comments: PrComment[], opts: PrCommentsValueOptions = {}): PrCommentsValue {
  const drafts: PrReplies | null = opts.drafts
    ? { schemaVersion: 2, sessionId: SESSION_ID, updatedAt: '2026-10-05T10:00:00.000Z', replies: opts.drafts }
    : null
  const response = buildPrCommentsResponse(makePrComments(comments, { sessionId: SESSION_ID }), opts.resolutions ?? null, null, drafts)
  return prCommentsValueFrom(response, {
    loading: false,
    error: null,
    reload: () => {},
    saveReply: opts.saveReply ?? okSaveReply(),
    registerReplyFlush: () => () => {},
    flushReplies: opts.flushReplies ?? (() => Promise.resolve(true)),
  })
}
