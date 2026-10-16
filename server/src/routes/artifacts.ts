import { Router } from 'express'
import type { NextFunction, Response } from 'express'
import type { ArtifactKind } from '../store/artifacts.ts'
import type { ServedFile, Store } from '../store/index.ts'
import { wildcardPath } from './params.ts'

/** `res.sendFile` with `root`, so `send` handles Range (206), ETag and conditional requests. */
function sendStoreFile(res: Response, next: NextFunction, file: ServedFile): void {
  const headers: Record<string, string> = { 'X-Content-Type-Options': 'nosniff' }
  if (file.contentType !== null) headers['Content-Type'] = file.contentType
  res.sendFile(file.relative, { root: file.root, acceptRanges: true, headers }, (err) => {
    if (err && !res.headersSent) next(err)
  })
}

const KINDS: readonly ArtifactKind[] = ['evidence', 'extras', 'spec']

/** `GET /sessions/:id/{evidence,extras,spec}/*path`, allowlisted to the derived items. */
export function artifactsRouter(store: Store): Router {
  const router = Router()
  for (const kind of KINDS) {
    router.get(`/sessions/:id/${kind}/*path`, async (req, res, next) => {
      sendStoreFile(res, next, await store.artifactFile(req.params.id, kind, wildcardPath(req.params.path)))
    })
  }
  return router
}
