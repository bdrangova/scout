import path from 'node:path'
import express, { Router } from 'express'

/**
 * Serves a built web app (`vite build` output) next to the API, so one process on one port is the whole
 * dashboard. Hashed assets are cached for good; every other GET that is not a file gets `index.html`, so
 * client-side routes like `/s/<id>` load on refresh.
 */
export function webAppRouter(dir: string): Router {
  const router = Router()
  router.use(
    '/assets',
    express.static(path.join(dir, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
  )
  router.use(express.static(dir, { index: false }))
  router.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    // `root`, not a joined path: `send` refuses any path with a dot folder in it, like `~/.ai-review`.
    res.sendFile('index.html', { root: dir })
  })
  return router
}
