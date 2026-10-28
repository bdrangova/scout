import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
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
