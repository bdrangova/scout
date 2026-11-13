import { Router } from 'express'
import { PutBlueprintLayoutRequestSchema } from '@scout/shared'
import type { ApiError } from '@scout/shared'
import { formatZodError } from '../errors.ts'
import type { Store } from '../store/index.ts'

/** The Blueprint of a session (computed from the diff) and the reviewer's saved arrangement of its diagrams. */
export function blueprintRouter(store: Store): Router {
  const router = Router()

  router.get('/sessions/:id/blueprint', async (req, res) => {
    res.json(await store.getBlueprint(req.params.id))
  })

  router.get('/sessions/:id/blueprint/groups', async (req, res) => {
    res.json(await store.getBlueprintGroups(req.params.id))
  })

  router.get('/sessions/:id/blueprint/layout', async (req, res) => {
    res.json(await store.getBlueprintLayout(req.params.id))
  })

  router.put('/sessions/:id/blueprint/layout', async (req, res) => {
    const parsed = PutBlueprintLayoutRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      const body: ApiError = { error: `invalid PutBlueprintLayoutRequest: ${formatZodError(parsed.error)}` }
      res.status(400).json(body)
      return
    }
    res.json(await store.putBlueprintLayout(req.params.id, parsed.data))
  })

  return router
}
