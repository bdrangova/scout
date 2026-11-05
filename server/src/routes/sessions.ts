import { Router } from 'express'
import { ArchiveRequestSchema } from '@scout/shared'
import type { ApiError, ManifestKind } from '@scout/shared'
import { badRequest, formatZodError } from '../errors.ts'
import type { Store } from '../store/index.ts'
import { queryString } from './params.ts'

/** The validated `?kind=` (`undefined` when absent), or null after answering 400. */
function kindFilter(value: unknown): ManifestKind | undefined | null {
  const kind = queryString(value)
  if (kind === undefined) return undefined
  return kind === 'code-review' || kind === 'test-run' || kind === 'pr-review' ? kind : null
}

export function sessionsRouter(store: Store): Router {
  const router = Router()

  router.get('/sessions', async (req, res) => {
    const kind = kindFilter(req.query.kind)
    if (kind === null) {
      const body: ApiError = { error: 'query parameter kind must be "code-review", "test-run" or "pr-review"' }
      res.status(400).json(body)
      return
    }
    res.json(await store.listSessions(kind))
  })

  // Before `/sessions/:id`, or "archived" would be read as a session id.
  router.get('/sessions/archived', async (req, res) => {
    const kind = kindFilter(req.query.kind)
    if (kind === null) {
      res.status(400).json({ error: 'query parameter kind must be "code-review", "test-run" or "pr-review"' })
      return
    }
    res.json(await store.listArchived(kind))
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
    const body = ArchiveRequestSchema.safeParse(req.body ?? {})
    if (!body.success) throw badRequest(formatZodError(body.error))
    await store.archiveSession(req.params.id, new Date(), body.data.done === true)
    res.json({ id: req.params.id })
  })

  router.post('/sessions/:id/unarchive', async (req, res) => {
    await store.unarchiveSession(req.params.id)
    res.json({ id: req.params.id })
  })

  return router
}
