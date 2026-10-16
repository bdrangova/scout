import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMMIT_SHAS, makeCommitList, makeTreeFile, sessionListFixture, treeFixture } from '@/test/fixtures'
import { MockEventSource, stubEventSource } from '@/test/mock-event-source'
import { useCommits, useFileContents, useFilePatch, useScopeTree, useSessionList } from './hooks'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function textResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })
}

describe('hooks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('useSessionList loads /api/sessions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, sessionListFixture))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSessionList())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toHaveLength(sessionListFixture.length)
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions', expect.anything())
  })

  it('useFilePatch returns the text patch and encodes the path segment by segment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse('diff --git a/x b/x'))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useFilePatch('sid', 'src/a b/c#1.ts'))
    await waitFor(() => expect(result.current.patch).toBe('diff --git a/x b/x'))
    expect(result.current.isLarge).toBe(false)
    expect(result.current.isOmitted).toBe(false)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sessions/sid/files/src/a%20b/c%231.ts/patch')
  })

  it('useFilePatch treats a 413 as isLarge and refetches with ?force=1', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(413, { error: 'collapsed', isLarge: true }))
      .mockResolvedValueOnce(textResponse('diff --git a/big b/big'))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(({ force }) => useFilePatch('sid', 'big.json', { force }), {
      initialProps: { force: false },
    })
    await waitFor(() => expect(result.current.isLarge).toBe(true))
    expect(result.current.error).toBeNull()
    rerender({ force: true })
    await waitFor(() => expect(result.current.patch).toBe('diff --git a/big b/big'))
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/sessions/sid/files/big.json/patch?force=1')
  })

  it('useFilePatch treats a 410 as isOmitted, not as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(410, { error: 'omitted' })))
    const { result } = renderHook(() => useFilePatch('sid', 'huge.bin'))
    await waitFor(() => expect(result.current.isOmitted).toBe(true))
    expect(result.current.error).toBeNull()
    expect(result.current.patch).toBeNull()
  })

  it('useFilePatch refetches when the fingerprint changes and keeps the old patch meanwhile', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(textResponse('old')).mockResolvedValueOnce(textResponse('new'))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(({ fingerprint }) => useFilePatch('sid', 'a.ts', { fingerprint }), {
      initialProps: { fingerprint: 'aaaaaaaaaaaaaaaa' },
    })
    await waitFor(() => expect(result.current.patch).toBe('old'))
    rerender({ fingerprint: 'bbbbbbbbbbbbbbbb' })
    await waitFor(() => expect(result.current.patch).toBe('new'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('useFilePatch does nothing when disabled', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useFilePatch('sid', 'x', { enabled: false }))
    expect(result.current.loading).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('useFileContents loads one side of the contents route and refetches when the fingerprint changes', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(textResponse('# v1')).mockResolvedValueOnce(textResponse('# v2'))
    vi.stubGlobal('fetch', fetchMock)
    const { result, rerender } = renderHook(({ fingerprint }) => useFileContents('sid', 'docs/a b.md', 'before', { fingerprint }), {
      initialProps: { fingerprint: 'aaaaaaaaaaaaaaaa' },
    })
    await waitFor(() => expect(result.current.content).toBe('# v1'))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sessions/sid/files/docs/a%20b.md/contents?side=before')
    rerender({ fingerprint: 'bbbbbbbbbbbbbbbb' })
    await waitFor(() => expect(result.current.content).toBe('# v2'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('useFileContents does nothing when disabled', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useFileContents('sid', 'x.md', 'after', { enabled: false }))
    expect(result.current.loading).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('useFilePatch and useFileContents read a scope\'s routes when given one', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(textResponse('scoped')))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useFilePatch('sid', 'a.ts', { scope: COMMIT_SHAS.first }))
    await waitFor(() => expect(result.current.patch).toBe('scoped'))
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/sessions/sid/scopes/${COMMIT_SHAS.first}/files/a.ts/patch`)
    const contents = renderHook(() => useFileContents('sid', 'a.md', 'after', { scope: 'uncommitted' }))
    await waitFor(() => expect(contents.result.current.content).toBe('scoped'))
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/sessions/sid/scopes/uncommitted/files/a.md/contents?side=after')
  })

  it('useCommits loads the commit list and refetches it on the session\'s tree.updated only', async () => {
    stubEventSource()
    const list = makeCommitList()
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, list)))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCommits('sid'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.commits?.commits).toHaveLength(3))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sessions/sid/commits')
    const source = MockEventSource.latest('/api/events')
    source?.emit('message', { type: 'tree.updated', sessionId: 'other', fingerprint: 'f'.repeat(16), durationMs: 1 })
    source?.emit('message', { type: 'tree.updated', sessionId: 'sid', fingerprint: 'f'.repeat(16), durationMs: 1 })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    // The stale list stays while the new one loads.
    expect(result.current.commits?.commits).toHaveLength(3)
  })

  it('useCommits surfaces a failure as an error with no list', async () => {
    stubEventSource()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(422, { error: 'repository missing' })))
    const { result } = renderHook(() => useCommits('sid'))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.commits).toBeNull()
  })

  it('useScopeTree is idle for the full diff, loads a scope and refetches only the uncommitted one on tree.updated', async () => {
    stubEventSource()
    const tree = { ...treeFixture, files: [makeTreeFile({ path: 'src/only.ts' })] }
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, tree)))
    vi.stubGlobal('fetch', fetchMock)
    const idle = renderHook(() => useScopeTree('sid', null))
    expect(idle.result.current.loading).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()

    const commit = renderHook(() => useScopeTree('sid', COMMIT_SHAS.first))
    await waitFor(() => expect(commit.result.current.tree?.files).toHaveLength(1))
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/sessions/sid/scopes/${COMMIT_SHAS.first}`)
    expect(MockEventSource.instances).toHaveLength(0)

    const uncommitted = renderHook(() => useScopeTree('sid', 'uncommitted'))
    await waitFor(() => expect(uncommitted.result.current.tree).not.toBeNull())
    MockEventSource.latest('/api/events')?.emit('message', { type: 'tree.updated', sessionId: 'sid', fingerprint: 'f'.repeat(16), durationMs: 1 })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/sessions/sid/scopes/uncommitted')
  })
})
