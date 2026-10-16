import { Router } from 'express'
import type { Store } from '../store/index.ts'

export function sessionsRouter(store: Store): Router {
  const router = Router()

  router.get('/sessions', async (_req, res) => {
    res.json(await store.listSessions())
  })

  // Before `/sessions/:id`, or "archived" would be read as a session id.
  router.get('/sessions/archived', async (_req, res) => {
    res.json(await store.listArchived())
  })

  // Archived sessions only: a live id is 404 and nothing is touched. No event is emitted.
  router.delete('/sessions/archived/:id', async (req, res) => {
    await store.deleteArchivedSession(req.params.id)
    res.json({ id: req.params.id })
  })

  router.get('/sessions/:id', async (req, res) => {
    res.json(await store.getSession(req.params.id))
  })

  router.post('/sessions/:id/archive', async (req, res) => {
    await store.archiveSession(req.params.id)
    res.json({ id: req.params.id })
  })

  router.post('/sessions/:id/unarchive', async (req, res) => {
    await store.unarchiveSession(req.params.id)
    res.json({ id: req.params.id })
  })

  return router
}
