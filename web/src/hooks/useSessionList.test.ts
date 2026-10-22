import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArchivedListState, SessionListState } from '@/lib/hooks'
import { sessionListFixture } from '@/test/fixtures'
import { useSessionList } from './useSessionList'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const listState = vi.hoisted(() => ({
  current: { sessions: null, loading: true, error: null, reload: () => {} } as SessionListState,
  archived: { archived: [], loading: false, error: null, reload: () => {} } as ArchivedListState,
}))

vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks')>()),
  useSessionList: () => listState.current,
  useArchivedSessions: () => listState.archived,
}))

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('useSessionList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('sorts newest first with broken rows last, counts per filter and narrows `visible`', () => {
    listState.current = { sessions: [...sessionListFixture].reverse(), loading: false, error: null, reload: () => {} }
    const { result } = renderHook(() => useSessionList())
    expect(result.current.items.map((item) => item.id)[0]).toBe(sessionListFixture[0]?.id)
    expect(result.current.items.at(-1)).toHaveProperty('error')
    expect(result.current.counts).toMatchObject({ all: 6, awaiting: 1, 'in-progress': 1, ready: 0, sent: 1, updated: 1, approved: 1, archived: 0 })
    expect(result.current.visible).toHaveLength(6)

    act(() => result.current.setFilter('sent'))
    expect(result.current.visible.map((item) => item.id)).toEqual(['20260919-1600-grid-migration-d4e5'])

    act(() => result.current.toggleArchived())
    expect(result.current.filter).toBe('archived')
    expect(result.current.visible).toHaveLength(0)
    act(() => result.current.toggleArchived())
    expect(result.current.filter).toBe('sent')
  })

  it('hides an archived row at once and reloads both lists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { id: 'x' })))
    const reload = vi.fn()
    const reloadArchived = vi.fn()
    listState.current = { sessions: sessionListFixture, loading: false, error: null, reload }
    listState.archived = { archived: [], loading: false, error: null, reload: reloadArchived }
    const { result } = renderHook(() => useSessionList())
    const first = sessionListFixture[0]
    if (!first || !('tickets' in first)) throw new Error('fixture')

    await act(() => result.current.archive(first))
    expect(result.current.items.some((item) => item.id === first.id)).toBe(false)
    expect(result.current.counts.all).toBe(5)
    expect(reload).toHaveBeenCalledOnce()
    expect(reloadArchived).toHaveBeenCalledOnce()
  })

  it('keeps the row and reloads nothing when archiving fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { error: 'run-active' })))
    const reload = vi.fn()
    listState.current = { sessions: sessionListFixture, loading: false, error: null, reload }
    const { result } = renderHook(() => useSessionList())
    const first = sessionListFixture[0]
    if (!first || !('tickets' in first)) throw new Error('fixture')

    await act(() => result.current.archive(first))
    expect(result.current.items.some((item) => item.id === first.id)).toBe(true)
    expect(reload).not.toHaveBeenCalled()
  })
})
