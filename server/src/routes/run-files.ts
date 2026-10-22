import { Router } from 'express'
import type { ApiError } from '@review-dash/shared'
import { notFound } from '../errors.ts'
import type { Store } from '../store/index.ts'
import { sendStoreFile } from './artifacts.ts'
import { queryString, wildcardPath } from './params.ts'

/** `alias/relative/path` in the URL is the ref `alias:relative/path`; a path without an alias segment is 404. */
function refFromUrl(param: string | string[] | undefined): string {
  const joined = wildcardPath(param)
  const slash = joined.indexOf('/')
  if (slash <= 0 || slash === joined.length - 1) throw notFound(`${JSON.stringify(joined)} is not a run file`)
  return `${joined.slice(0, slash)}:${joined.slice(slash + 1)}`
}

function lineParam(value: unknown, fallback: number): number | null {
  const raw = queryString(value)
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** `GET /sessions/:id/run/file/*ref` and `/run/log/*ref`, allowlisted to what the run's index names. */
export function runFilesRouter(store: Store): Router {
  const router = Router()

  router.get('/sessions/:id/run/file/*ref', async (req, res, next) => {
    sendStoreFile(res, next, await store.testRunFile(req.params.id, refFromUrl(req.params.ref)))
  })

  router.get('/sessions/:id/run/log/*ref', async (req, res) => {
    const from = lineParam(req.query.from, 1)
    const to = lineParam(req.query.to, from === null ? 1 : from + 1999)
    if (from === null || to === null || to < from) {
      const body: ApiError = { error: 'query parameters from and to must be line numbers (1-based) with to >= from' }
      res.status(400).json(body)
      return
    }
    res.json(await store.testRunLog(req.params.id, refFromUrl(req.params.ref), from, to))
  })

  return router
}
