import { afterEach, describe, expect, it, vi } from 'vitest'
import { calls, json, stubApi } from '@/test/worktree-api'
import { deleteSession } from './archive'

const ID = '20261030-0900-live-pr-cd34'
const ARCHIVE = `POST /api/sessions/${ID}/archive`
const DELETE = `DELETE /api/sessions/archived/${ID}`

afterEach(() => vi.unstubAllGlobals())

describe('deleteSession', () => {
  it('archives a live session, then deletes the archived folder', async () => {
    const fetchMock = stubApi({ [ARCHIVE]: () => json(200, { id: ID }), [DELETE]: () => json(200, { id: ID }) })
    await deleteSession(ID)
    expect(calls(fetchMock)).toEqual([ARCHIVE, DELETE])
  })

  it('goes straight to the delete when the session is already archived (archive answers 404)', async () => {
    const fetchMock = stubApi({ [DELETE]: () => json(200, { id: ID }) })
    await deleteSession(ID)
    expect(calls(fetchMock)).toEqual([ARCHIVE, DELETE])
  })

  it('throws on 409 (Claude still working) and sends no delete', async () => {
    const fetchMock = stubApi({ [ARCHIVE]: () => json(409, { error: 'run-active' }), [DELETE]: () => json(200, { id: ID }) })
    await expect(deleteSession(ID)).rejects.toMatchObject({ status: 409, body: { error: 'run-active' } })
    expect(calls(fetchMock)).toEqual([ARCHIVE])
  })

  it('throws other archive errors without deleting', async () => {
    const fetchMock = stubApi({ [ARCHIVE]: () => json(500, { error: 'boom' }), [DELETE]: () => json(200, { id: ID }) })
    await expect(deleteSession(ID)).rejects.toMatchObject({ status: 500 })
    expect(calls(fetchMock)).toEqual([ARCHIVE])
  })
})
