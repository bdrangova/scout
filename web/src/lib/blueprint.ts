import {
  buildBlueprintDiagram,
  buildBlueprintTree,
  parseBlueprintDiagramId,
  BLUEPRINT_ROOT_DIAGRAM,
  type Blueprint,
  type BlueprintDiagram,
  type BlueprintDiagramLayout,
  type BlueprintLayout,
  type BlueprintLayoutResponse,
  type BlueprintPackage,
  type BlueprintResponse,
  type PutBlueprintLayoutRequest,
  type PutBlueprintLayoutResponse,
} from '@scout/shared'
import { useCallback, useMemo } from 'react'
import { apiGet, apiPut } from './api'
import { useAsync } from './hooks'
import { useStoreEvents } from './useStoreEvents'

/** `?bp=<diagram id>` on the Files page: the deck is limited to that Blueprint diagram's files, in its reading order. */
export const BLUEPRINT_PARAM = 'bp'
/** `?at=<diagram id>` on the Blueprint page: the diagram shown; absent = the whole change. */
export const BLUEPRINT_AT_PARAM = 'at'

export function blueprintPath(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}/blueprint`
}

export function blueprintLayoutPath(sessionId: string): string {
  return `${blueprintPath(sessionId)}/layout`
}

/** The Blueprint page of a code-review or PR-review session, opened on `diagram` (the whole change when absent). */
export function blueprintRoute(sessionId: string, diagram?: string | null): string {
  const base = `/s/${encodeURIComponent(sessionId)}/blueprint`
  return diagram && diagram !== BLUEPRINT_ROOT_DIAGRAM ? `${base}?${BLUEPRINT_AT_PARAM}=${encodeURIComponent(diagram)}` : base
}

/** `params` with the Blueprint diagram set or removed, keeping everything else (`mode`, `show`). */
export function withBlueprint(params: URLSearchParams, diagram: string | null): URLSearchParams {
  const next = new URLSearchParams(params)
  if (diagram === null) next.delete(BLUEPRINT_PARAM)
  else next.set(BLUEPRINT_PARAM, diagram)
  return next
}

export interface BlueprintState {
  /** Null until loaded, and for a session without one (a test run). */
  blueprint: Blueprint | null
  /** The package tree of the analysed files; null with `blueprint`. */
  root: BlueprintPackage | null
  loading: boolean
  error: Error | null
  reload: () => void
}

/**
 * `GET /api/sessions/:id/blueprint`, refetched when the session's tree changed (the stale analysis stays meanwhile).
 * `enabled: false` skips the request (the Files page only needs it while `?bp=` is set).
 */
export function useBlueprint(sessionId: string, enabled = true): BlueprintState {
  const state = useAsync(enabled ? `blueprint:${sessionId}` : null, () => apiGet<BlueprintResponse>(blueprintPath(sessionId)))
  const { reload } = state
  const fingerprint = state.data?.blueprint?.fingerprint
  useStoreEvents({
    'tree.updated': (event) => {
      if (enabled && event.sessionId === sessionId && event.fingerprint !== fingerprint) reload()
    },
  })
  const blueprint = state.data?.blueprint ?? null
  const root = useMemo(() => (blueprint === null ? null : buildBlueprintTree(blueprint.files.map((file) => file.path))), [blueprint])
  return { blueprint, root, loading: state.loading, error: state.error, reload }
}

/** The diagram `id` names (the whole change for an unknown or absent id that is not a diagram id); null while loading or when it no longer exists. */
export function blueprintDiagramOf(state: Pick<BlueprintState, 'blueprint' | 'root'>, id: string | null): BlueprintDiagram | null {
  if (state.blueprint === null || state.root === null) return null
  const ref = parseBlueprintDiagramId(id ?? BLUEPRINT_ROOT_DIAGRAM)
  return ref === null ? null : buildBlueprintDiagram(state.blueprint, state.root, ref)
}

export interface BlueprintLayoutState {
  /** Null until loaded, and when nothing was arranged yet. */
  layout: BlueprintLayout | null
  loading: boolean
  /** Replaces one diagram's saved arrangement; `null` forgets it. Resolves when the server has it. */
  save: (diagram: string, layout: BlueprintDiagramLayout | null) => Promise<void>
}

/** `GET` / `PUT /api/sessions/:id/blueprint/layout`; refetched when another tab or tool changed the file. */
export function useBlueprintLayout(sessionId: string): BlueprintLayoutState {
  const state = useAsync(`blueprint-layout:${sessionId}`, () => apiGet<BlueprintLayoutResponse>(blueprintLayoutPath(sessionId)))
  const { reload } = state
  useStoreEvents({
    'blueprint-layout.updated': (event) => {
      if (event.sessionId === sessionId) reload()
    },
  })
  const save = useCallback(
    async (diagram: string, layout: BlueprintDiagramLayout | null) => {
      const body: PutBlueprintLayoutRequest = { diagram, layout }
      await apiPut<PutBlueprintLayoutResponse>(blueprintLayoutPath(sessionId), body)
    },
    [sessionId],
  )
  return { layout: state.data?.layout ?? null, loading: state.loading, save }
}
