import express from 'express'
import request from 'supertest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeSettings } from '../settings.ts'
import { settingsRouter } from './settings.ts'

function appWith(pickFolder: () => Promise<string | null>) {
  return express().use(settingsRouter('/nonexistent-home', pickFolder))
}

describe('POST /settings/pick-folder', () => {
  it('returns the chosen folder', async () => {
    const res = await request(appWith(async () => '/Users/me/worktrees')).post('/settings/pick-folder')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ path: '/Users/me/worktrees' })
  })

  it('returns null when the chooser is cancelled', async () => {
    const res = await request(appWith(async () => null)).post('/settings/pick-folder')
    expect(res.body).toEqual({ path: null })
  })
})

describe('writeSettings', () => {
  it('keeps the keys the CLI owns in the shared config.json', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'scout-settings-'))
    const cli = { port: 4546, trustedPrCommentAuthors: ['bot'], repos: { '/r': { runtime: 'bash rt.sh' } } }
    await writeFile(path.join(home, 'config.json'), JSON.stringify({ ...cli, worktreeFolders: ['/old'] }))
    await writeSettings(home, { worktreeFolders: ['/new', '/new'] })
    expect(JSON.parse(await readFile(path.join(home, 'config.json'), 'utf8'))).toEqual({ ...cli, worktreeFolders: ['/new'] })
  })
})
