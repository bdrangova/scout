import { Router } from 'express'
import { SendRequestSchema } from '@scout/shared'
import type { ApiError } from '@scout/shared'
import { formatZodError } from '../errors.ts'
import { sendReview } from '../send.ts'
import type { SendDeps } from '../send.ts'

export function sendRouter(deps: SendDeps): Router {
  const router = Router()

  router.post('/sessions/:id/review/send', async (req, res) => {
    const parsed = SendRequestSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      const body: ApiError = { error: `invalid SendRequest: ${formatZodError(parsed.error)}` }
      res.status(400).json(body)
      return
    }
    res.json(await sendReview(deps, req.params.id, parsed.data))
  })

  return router
}
