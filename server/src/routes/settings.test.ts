import express from 'express'
import request from 'supertest'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
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

describe('GET /packs', () => {
  it('lists the registered packs with their help entries, and a broken one with its error', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'scout-packs-'))
    const pack = path.join(home, 'acme')
    await mkdir(pack)
    const help = [{ group: 'Worktrees', command: '/acme-worktree', when: 'Start one.' }]
    await writeFile(path.join(pack, 'scout-pack.json'), JSON.stringify({ name: 'acme', repos: ['acme-app'], help }))
    await writeFile(path.join(home, 'config.json'), JSON.stringify({ port: 4546, packs: [pack, path.join(home, 'gone')] }))
    const res = await request(express().use(settingsRouter(home))).get('/packs')
    expect(res.status).toBe(200)
    expect(res.body.packs).toEqual([
      { dir: pack, name: 'acme', repos: ['acme-app'], help, error: null },
      { dir: path.join(home, 'gone'), name: null, repos: [], help: [], error: expect.stringMatching(/no scout-pack.json/) },
    ])
  })

  it('answers an empty list without a config file', async () => {
    const res = await request(appWith(async () => null)).get('/packs')
    expect(res.body).toEqual({ packs: [] })
  })
})

describe('writeSettings', () => {
  it('keeps the keys the CLI owns in the shared config.json', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'scout-settings-'))
    const cli = { port: 4546, trustedPrCommentAuthors: ['bot'], repos: { '/r': { runtime: 'bash rt.sh' } } }
    await writeFile(path.join(home, 'config.json'), JSON.stringify({ ...cli, worktreeFolders: ['/old'] }))
    await writeSettings(home, { worktreeFolders: ['/new', '/new'] })
    expect(JSON.parse(await readFile(path.join(home, 'config.json'), 'utf8'))).toEqual({ ...cli, worktreeFolders: ['/new'], github: { repos: [], teams: [] } })
  })
})

describe('writeSettings github', () => {
  it('trims, dedupes case-insensitively, strips @ from members and keeps team order', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'scout-settings-'))
    const saved = await writeSettings(home, {
      worktreeFolders: [],
      github: {
        repos: ['Acme/Web', 'acme/web', 'acme/api'],
        teams: [
          { id: 'zeta', name: ' Zeta ', githubTeams: ['acme/Zeta', 'acme/zeta'], members: ['@Ann', 'ann', 'bob'] },
          { id: 'alpha', name: 'Alpha', githubTeams: [], members: [] },
        ],
      },
    })
    expect(saved.github).toEqual({
      repos: ['Acme/Web', 'acme/api'],
      teams: [
        { id: 'zeta', name: 'Zeta', githubTeams: ['acme/Zeta'], members: ['Ann', 'bob'] },
        { id: 'alpha', name: 'Alpha', githubTeams: [], members: [] },
      ],
    })
    expect(JSON.parse(await readFile(path.join(home, 'config.json'), 'utf8')).github).toEqual(saved.github)
  })

  it('defaults to no repos and teams', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'scout-settings-'))
    expect((await writeSettings(home, { worktreeFolders: [] })).github).toEqual({ repos: [], teams: [] })
  })
})
