import { Router } from 'express'
import type { Store } from '../store/index.ts'
import { deleteWorktree, loadWorktrees, worktreeDetail } from '../worktrees/index.ts'

export function worktreesRouter(home: string, store: Store): Router {
  const router = Router()
  router.get('/worktrees', async (_req, res) => {
    res.json((await loadWorktrees(home, store)).response)
  })
  router.get('/worktrees/:id', async (req, res) => {
    res.json(await worktreeDetail(home, store, req.params.id))
  })
  router.delete('/worktrees/:id', async (req, res) => {
    await deleteWorktree(home, store, req.params.id)
    res.status(204).end()
  })
  return router
}
