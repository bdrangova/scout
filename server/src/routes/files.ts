import { Router } from 'express'
import type { Request, Response } from 'express'
import type { ApiError, FileContentsSide, TreeFile } from '@review-dash/shared'
import type { FileContents, Store } from '../store/index.ts'
import { contentSecurityPolicy } from '../security.ts'
import { queryString, wildcardPath } from './params.ts'

/** text/plain patch, or 413 `isLarge` for a collapsed file unless `?force=1`. */
export function sendPatch(req: Request, res: Response, file: TreeFile, patch: string): void {
  if (file.collapsed && queryString(req.query.force) !== '1') {
    const body: ApiError = {
      error: `${file.path} is a large file (${file.additions + file.deletions} changed lines${file.collapseReason ? `, ${file.collapseReason}` : ''}); add ?force=1 to load its patch`,
      isLarge: true,
    }
    res.status(413).json(body)
    return
  }
  res.type('text/plain').send(patch)
}

/** The validated `?side=`, or null after answering 400. */
export function contentsSide(req: Request, res: Response): FileContentsSide | null {
  const side = queryString(req.query.side)
  if (side === 'before' || side === 'after') return side
  const body: ApiError = { error: 'query parameter side must be "before" or "after"' }
  res.status(400).json(body)
  return null
}

export function sendContents(res: Response, { body, contentType }: FileContents): void {
  res.setHeader('Content-Type', contentType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', contentSecurityPolicy(contentType))
  res.send(body)
}

export function filesRouter(store: Store): Router {
  const router = Router()

  router.get('/sessions/:id/patch', async (req, res) => {
    res.type('text/plain').send(await store.fullPatch(req.params.id))
  })

  router.get('/sessions/:id/files/*path/patch', async (req, res) => {
    const { file, patch } = await store.filePatch(req.params.id, wildcardPath(req.params.path))
    sendPatch(req, res, file, patch)
  })

  router.get('/sessions/:id/files/*path/contents', async (req, res) => {
    const side = contentsSide(req, res)
    if (side === null) return
    sendContents(res, await store.fileContents(req.params.id, wildcardPath(req.params.path), side))
  })

  /** `?q=` (2+ characters) through the changed files' patches, or with `&scope=repo` through every file. */
  router.get('/sessions/:id/search', async (req, res) => {
    const query = queryString(req.query.q)?.trim() ?? ''
    if (query.length < 2) {
      const body: ApiError = { error: 'query parameter q must be at least 2 characters' }
      res.status(400).json(body)
      return
    }
    res.json(queryString(req.query.scope) === 'repo' ? await store.searchRepo(req.params.id, query) : await store.searchDiff(req.params.id, query))
  })

  router.get('/sessions/:id/repo-files/*path', async (req, res) => {
    sendContents(res, await store.repoFile(req.params.id, wildcardPath(req.params.path)))
  })

  return router
}
