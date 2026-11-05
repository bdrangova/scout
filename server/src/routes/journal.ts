import { Router } from 'express'
import type { Store } from '../store/index.ts'

/** `GET /sessions/:id/journal`: Scout's journal (read-only; written by `scout journal`). `{ journal: null }` when there is none. */
export function journalRouter(store: Store): Router {
  const router = Router()
  router.get('/sessions/:id/journal', async (req, res) => {
    res.json(await store.getJournal(req.params.id))
  })
  return router
}
