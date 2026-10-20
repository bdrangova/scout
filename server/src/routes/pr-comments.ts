import { Router } from 'express'
import { PR_COMMENT_ID_RE, PutPrReplyRequestSchema } from '@review-dash/shared'
import { badRequest, formatZodError } from '../errors.ts'
import type { Store } from '../store/index.ts'

/**
 * `GET /sessions/:id/pr-comments`: the synced GitHub PR comments with their derived status, the agent's proposed replies and the user's drafts (read-only for the CLI's files).
 * `PUT /sessions/:id/pr-replies/:commentId`: saves the user's instruction (open thread) or reply (answered thread) for a comment; nothing is posted to GitHub.
 */
export function prCommentsRouter(store: Store): Router {
  const router = Router()
  router.get('/sessions/:id/pr-comments', async (req, res) => {
    res.json(await store.getPrComments(req.params.id))
  })
  router.put('/sessions/:id/pr-replies/:commentId', async (req, res) => {
    const { commentId } = req.params
    if (!PR_COMMENT_ID_RE.test(commentId)) throw badRequest(`${JSON.stringify(commentId)} is not a PR comment id (rc<n>, ic<n> or rv<n>)`)
    const parsed = PutPrReplyRequestSchema.safeParse(req.body)
    if (!parsed.success) throw badRequest(`invalid PutPrReplyRequest: ${formatZodError(parsed.error)}`)
    res.json(await store.putPrReply(req.params.id, commentId, parsed.data.body, parsed.data.kind))
  })
  return router
}
