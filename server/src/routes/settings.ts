import { execFile } from 'node:child_process'
import { Router } from 'express'
import type { PacksResponse, PickFolderResponse } from '@scout/shared'
import { loadRegisteredPacks } from '@scout/shared/packs'
import { readSettings, writeSettings } from '../settings.ts'

// Runs inside the frontmost app so the chooser opens in front of the browser, not behind it.
const CHOOSE_FOLDER_SCRIPT =
  'tell application (path to frontmost application as text) to POSIX path of (choose folder with prompt "Choose a folder that holds git worktrees")'

/** The native macOS folder chooser; null when the user cancels (AppleScript error -128). */
export function pickFolderNative(): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return Promise.reject(Object.assign(new Error('The folder picker is only available on macOS'), { status: 501 }))
  }
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', CHOOSE_FOLDER_SCRIPT], (err, stdout, stderr) => {
      if (err) {
        if (/-128/.test(stderr)) resolve(null)
        else reject(new Error(`osascript failed: ${stderr.trim() || err.message}`))
        return
      }
      const picked = stdout.trim().replace(/(.)\/+$/, '$1')
      resolve(picked === '' ? null : picked)
    })
  })
}

export function settingsRouter(home: string, pickFolder: () => Promise<string | null> = pickFolderNative): Router {
  const router = Router()
  router.get('/settings', async (_req, res) => {
    res.json(await readSettings(home))
  })
  router.put('/settings', async (req, res) => {
    res.json(await writeSettings(home, req.body))
  })
  // Registered packs (`ai-review pack add`) for the Skills help; read-only, registering stays in the terminal.
  router.get('/packs', async (_req, res) => {
    const packs = await loadRegisteredPacks(home)
    const body: PacksResponse = {
      packs: packs.map((p) => ({ dir: p.dir, name: p.manifest?.name ?? null, repos: p.manifest?.repos ?? [], help: p.manifest?.help ?? [], error: p.error })),
    }
    res.json(body)
  })
  router.post('/settings/pick-folder', async (_req, res) => {
    const body: PickFolderResponse = { path: await pickFolder() }
    res.json(body)
  })
  return router
}
