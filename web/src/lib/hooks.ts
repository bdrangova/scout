import {
  UNCOMMITTED_SCOPE,
  type ArchivedSession,
  type CommitList,
  type Scope,
  type SessionDetail,
  type SessionListItem,
  type WorkingTree,
} from '@review-dash/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiRequestError, apiGet } from './api'
import { commitsPath, fileContentsPath, filePatchPath, scopeTreePath, type DiffSide, type SessionKind } from './paths'
import { useStoreEvents } from './useStoreEvents'

type Settled<T> = { ok: true; value: T } | { ok: false; error: Error }

/** The last settled load, tagged with the key it was loaded for. */
type Slot<T> = { key: string; settled: Settled<T> } | null

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  /** True until a result for the current key has arrived (a reload keeps the stale data meanwhile). */
  loading: boolean
  reload: () => void
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason))
}

/**
 * Load `load()` whenever `key` changes (`null` disables loading). Results are tagged with their
 * key, so a stale response never overwrites a newer one and `loading` is derived instead of set.
 */
export function useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> {
  const [slot, setSlot] = useState<Slot<T>>(null)
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    loadRef.current().then(
      (value) => {
        if (!cancelled) setSlot({ key, settled: { ok: true, value } })
      },
      (reason: unknown) => {
        if (!cancelled) setSlot({ key, settled: { ok: false, error: toError(reason) } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const settled = slot !== null && slot.key === key ? slot.settled : null
  return {
    data: settled !== null && settled.ok ? settled.value : null,
    error: settled !== null && !settled.ok ? settled.error : null,
    loading: key !== null && settled === null,
    reload,
  }
}

export interface SessionListState {
  sessions: SessionListItem[] | null
  loading: boolean
  error: Error | null
  reload: () => void
}

/** `GET /api/sessions?kind=`: the code reviews or the test runs; without `kind`, every session. */
export function useSessionList(kind?: SessionKind): SessionListState {
  const state = useAsync(`sessions:${kind ?? 'all'}`, () => apiGet<SessionListItem[]>(kind === undefined ? '/sessions' : `/sessions?kind=${kind}`))
  return { sessions: state.data, loading: state.loading, error: state.error, reload: state.reload }
}

export interface ArchivedListState {
  archived: ArchivedSession[] | null
  loading: boolean
  error: Error | null
  reload: () => void
}

/** `GET /api/sessions/archived`: manifests under `archive/`, newest `archivedAt` first. */
export function useArchivedSessions(kind?: SessionKind): ArchivedListState {
  const state = useAsync(`sessions:archived:${kind ?? 'all'}`, () => apiGet<ArchivedSession[]>(kind === undefined ? '/sessions/archived' : `/sessions/archived?kind=${kind}`))
  return { archived: state.data, loading: state.loading, error: state.error, reload: state.reload }
}

export interface SessionDetailState {
  detail: SessionDetail | null
  loading: boolean
  error: Error | null
  reload: () => void
}

/** `GET /api/sessions/:id`: the manifest, the live tree and the artifacts. `reload` keeps the stale detail meanwhile. */
export function useSessionDetail(id: string | undefined): SessionDetailState {
  const key = id ? `session:${id}` : null
  const state = useAsync(key, () => apiGet<SessionDetail>(`/sessions/${encodeURIComponent(id ?? '')}`))
  return { detail: state.data, loading: state.loading, error: state.error, reload: state.reload }
}

export interface CommitsState {
  commits: CommitList | null
  loading: boolean
  error: Error | null
  reload: () => void
}

/**
 * `GET /api/sessions/:id/commits`. Refetched on the session's `tree.updated` (the server emits it
 * for a push or a fetch too, so the pushed flags and the remote follow); the stale list stays
 * meanwhile.
 */
export function useCommits(sessionId: string): CommitsState {
  const state = useAsync(`commits:${sessionId}`, () => apiGet<CommitList>(commitsPath(sessionId)))
  const { reload } = state
  useStoreEvents({
    'tree.updated': (event) => {
      if (event.sessionId === sessionId) reload()
    },
  })
  return { commits: state.data, loading: state.loading, error: state.error, reload }
}

export interface ScopeTreeState {
  /** The scope's `WorkingTree`; null for the full diff and until the scope's own has arrived. */
  tree: WorkingTree | null
  loading: boolean
  error: Error | null
  reload: () => void
}

/**
 * `GET /api/sessions/:id/scopes/:scope`, disabled for the full diff (`scope` null). A commit's
 * tree is immutable; `uncommitted` refetches on the session's `tree.updated`.
 */
export function useScopeTree(sessionId: string, scope: Scope | null): ScopeTreeState {
  const key = scope === null ? null : `scope:${sessionId}:${scope}`
  const state = useAsync(key, () => apiGet<WorkingTree>(scopeTreePath(sessionId, scope ?? UNCOMMITTED_SCOPE)))
  const { reload } = state
  useStoreEvents(
    {
      'tree.updated': (event) => {
        if (event.sessionId === sessionId) reload()
      },
    },
    scope === UNCOMMITTED_SCOPE,
  )
  return { tree: state.data, loading: state.loading, error: state.error, reload }
}

export interface FilePatchOptions {
  /** Ask the server for a collapsed file's patch anyway (`?force=1`). */
  force?: boolean
  /** Skip the request entirely (for files known to be collapsed, binary or omitted). */
  enabled?: boolean
  /** The file's `TreeFile.fingerprint`: a change refetches the patch (the content moved on disk). */
  fingerprint?: string
  /** Read the scope's own patch instead of the full diff's. */
  scope?: Scope | null
}

export interface FilePatchState {
  patch: string | null
  /** The server answered 413: the file is collapsed and needs `force`. */
  isLarge: boolean
  /** The server answered 410: the file is omitted from the diff (only its metadata is known). */
  isOmitted: boolean
  loading: boolean
  error: Error | null
  reload: () => void
}

export function useFilePatch(
  sessionId: string,
  path: string,
  { force = false, enabled = true, fingerprint = '', scope = null }: FilePatchOptions = {},
): FilePatchState {
  const key = enabled ? `patch:${sessionId}:${scope ?? ''}:${path}:${fingerprint}:${force ? 'force' : 'plain'}` : null
  const state = useAsync(key, () => apiGet<string>(filePatchPath(sessionId, path, force, scope)))
  const status = state.error instanceof ApiRequestError ? state.error.status : null
  const isLarge = status === 413
  const isOmitted = status === 410
  return {
    patch: state.data,
    isLarge,
    isOmitted,
    loading: state.loading,
    error: isLarge || isOmitted ? null : state.error,
    reload: state.reload,
  }
}

export interface FileContentsOptions {
  /** Skip the request entirely. */
  enabled?: boolean
  /** The file's `TreeFile.fingerprint`: a change refetches the contents (the file moved on disk). */
  fingerprint?: string
  /** Read the scope's sides (the parent's and the commit's blobs) instead of the full diff's. */
  scope?: Scope | null
}

export interface FileContentsState {
  content: string | null
  loading: boolean
  error: Error | null
  reload: () => void
}

/** Text of one side of a diffed file (`GET /api/sessions/:id/files/*path/contents?side=before|after`). */
export function useFileContents(
  sessionId: string,
  path: string,
  side: DiffSide,
  { enabled = true, fingerprint = '', scope = null }: FileContentsOptions = {},
): FileContentsState {
  const key = enabled ? `contents:${sessionId}:${scope ?? ''}:${path}:${side}:${fingerprint}` : null
  const state = useAsync(key, () => apiGet<string>(fileContentsPath(sessionId, path, side, scope)))
  return { content: state.data, loading: state.loading, error: state.error, reload: state.reload }
}
