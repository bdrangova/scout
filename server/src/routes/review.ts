import { Router } from 'express'
import { PutReviewRequestSchema } from '@review-dash/shared'
import type { ApiError, PutReviewResponse } from '@review-dash/shared'
import { formatZodError } from '../errors.ts'
import type { Store } from '../store/index.ts'

export function reviewRouter(store: Store): Router {
  const router = Router()

  router.get('/sessions/:id/review', async (req, res) => {
    res.json(await store.getReview(req.params.id))
  })

  router.put('/sessions/:id/review', async (req, res) => {
    const parsed = PutReviewRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      const body: ApiError = { error: `invalid PutReviewRequest: ${formatZodError(parsed.error)}` }
      res.status(400).json(body)
      return
    }
    if (parsed.data.review.sessionId !== req.params.id) {
      const body: ApiError = {
        error: `review.sessionId ${parsed.data.review.sessionId} does not match the route (${req.params.id})`,
      }
      res.status(400).json(body)
      return
    }
    const result = await store.putReview(req.params.id, parsed.data)
    if (!result.ok) {
      res.status(409).json(result.conflict)
      return
    }
    const body: PutReviewResponse = { updatedAt: result.updatedAt }
    res.json(body)
  })

  return router
}
