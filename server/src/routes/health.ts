import { Router } from 'express'
import type { Health } from '@scout/shared'
import type { Config } from '../config.ts'

export function healthRouter(config: Config): Router {
  const router = Router()
  router.get('/health', (_req, res) => {
    const body: Health = {
      ok: true,
      home: config.home,
    }
    res.json(body)
  })
  return router
}
