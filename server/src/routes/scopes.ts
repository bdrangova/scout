import { Router } from 'express'
import type { Request, Response } from 'express'
import { ScopeSchema } from '@scout/shared'
import type { ApiError, Scope } from '@scout/shared'
import type { Store } from '../store/index.ts'
import { contentsSide, sendContents, sendPatch } from './files.ts'
import { wildcardPath } from './params.ts'

/** The validated `:scope` (`uncommitted` or a full commit sha), or null after answering 400. */
function scopeParam(req: Request, res: Response): Scope | null {
  const parsed = ScopeSchema.safeParse(req.params.scope)
  if (parsed.success) return parsed.data
  const body: ApiError = { error: `scope must be "uncommitted" or a commit sha, not ${JSON.stringify(req.params.scope)}` }
  res.status(400).json(body)
  return null
}

/** The commits timeline and the per-scope diffs: `uncommitted` or one commit of `baseSha..HEAD`. */
export function scopesRouter(store: Store): Router {
  const router = Router()

  router.get('/sessions/:id/commits', async (req, res) => {
    res.json(await store.commits(req.params.id))
  })

  router.get('/sessions/:id/scopes/:scope', async (req, res) => {
    const scope = scopeParam(req, res)
    if (scope === null) return
    res.json((await store.scopeTree(req.params.id, scope)).result.tree)
  })

  router.get('/sessions/:id/scopes/:scope/files/*path/patch', async (req, res) => {
    const scope = scopeParam(req, res)
    if (scope === null) return
    const { file, patch } = await store.scopePatch(req.params.id, scope, wildcardPath(req.params.path))
    sendPatch(req, res, file, patch)
  })

  router.get('/sessions/:id/scopes/:scope/files/*path/contents', async (req, res) => {
    const scope = scopeParam(req, res)
    if (scope === null) return
    const side = contentsSide(req, res)
    if (side === null) return
    sendContents(res, await store.scopeContents(req.params.id, scope, wildcardPath(req.params.path), side))
  })

  return router
}
