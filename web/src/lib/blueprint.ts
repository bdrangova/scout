import {
  blueprintGroupingOfDir,
  buildBlueprintDiagram,
  buildBlueprintGroupTree,
  buildBlueprintTree,
  parseBlueprintDiagramId,
  BLUEPRINT_GROUPING_TYPES,
  BLUEPRINT_ROOT_DIAGRAM,
  blueprintGroupRootDir,
  type Blueprint,
  type BlueprintDiagram,
  type BlueprintDiagramLayout,
  type BlueprintLayout,
  type BlueprintLayoutResponse,
  type BlueprintGroupingType,
  type BlueprintGroups,
  type BlueprintGroupsResponse,
  type BlueprintGroupTree,
  type BlueprintPackage,
  type BlueprintResponse,
  type PutBlueprintLayoutRequest,
  type PutBlueprintLayoutResponse,
} from '@scout/shared'
import { useCallback, useMemo } from 'react'
import { apiGet, apiPut } from './api'
import { useAsync } from './hooks'
import { useStoreEvents } from './useStoreEvents'

/** `?file=<path>` on the Blueprint page: the file whose card is open in the overlay. */
export const BLUEPRINT_FILE_PARAM = 'file'
/** `?sel=<key>` on the Blueprint page next to `?file=`: the overlay's cards are the files picked in select mode, saved in sessionStorage under that key. */
export const BLUEPRINT_SELECTION_PARAM = 'sel'
/** `?at=<diagram id>` on the Blueprint page: the diagram shown; absent = the whole change. */
export const BLUEPRINT_AT_PARAM = 'at'

/** `?view=feature|layer|priority` on the Blueprint page: how the change is grouped; absent = by folder. */
export const BLUEPRINT_VIEW_PARAM = 'view'

/** `folders` is Scout's own tree; the others are the agent's groupings. */
export type BlueprintView = 'folders' | BlueprintGroupingType

/** The view a `?view=` value names (anything else is the folders). */
export function blueprintViewOf(raw: string | null): BlueprintView {
  return BLUEPRINT_GROUPING_TYPES.find((type) => type === raw) ?? 'folders'
}

/** The grouping a diagram id belongs to (`pkg:@feature/top-bar`); null for folders, around-diagrams and non-ids. */
export function groupingOfDiagram(id: string | null): BlueprintGroupingType | null {
  const ref = parseBlueprintDiagramId(id)
  return ref !== null && ref.type === 'package' ? blueprintGroupingOfDir(ref.dir) : null
}

/** The diagram id of a view's root: the whole change for folders, `pkg:@feature` for a grouping. */
export function blueprintViewRoot(view: BlueprintView): string {
  return view === 'folders' ? BLUEPRINT_ROOT_DIAGRAM : `pkg:${blueprintGroupRootDir(view)}`
}

/** The command that has the session's agent group the change; the page copies it, Scout starts no agent. */
export function blueprintGroupsCommand(sessionId: string, type: BlueprintGroupingType): string {
  return `/scout-blueprint-groups ${sessionId} ${type}`
}

export function blueprintPath(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}/blueprint`
}

export function blueprintGroupsPath(sessionId: string): string {
  return `${blueprintPath(sessionId)}/groups`
}

export function blueprintLayoutPath(sessionId: string): string {
  return `${blueprintPath(sessionId)}/layout`
}

/**
 * The query of the Blueprint page opened on `diagram` (empty for the whole change or a view's root).
 * A group diagram names its own view; around-a-file diagrams keep `view` (the one the reader came from); folders need none.
 */
export function blueprintSearch(diagram?: string | null, view: BlueprintView = 'folders'): string {
  const params = new URLSearchParams()
  const grouping = groupingOfDiagram(diagram ?? null)
  const around = parseBlueprintDiagramId(diagram)?.type === 'around'
  const shown = grouping ?? (around ? view : 'folders')
  if (diagram && diagram !== BLUEPRINT_ROOT_DIAGRAM && diagram !== blueprintViewRoot(shown)) params.set(BLUEPRINT_AT_PARAM, diagram)
  if (shown !== 'folders') params.set(BLUEPRINT_VIEW_PARAM, shown)
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/** The Blueprint page of a code-review or PR-review session, opened on `diagram` (the whole change when absent). */
export function blueprintRoute(sessionId: string, diagram?: string | null, view: BlueprintView = 'folders'): string {
  return `/s/${encodeURIComponent(sessionId)}/blueprint${blueprintSearch(diagram, view)}`
}

function selectionStorageKey(sessionId: string, key: string): string {
  return `scout:bp-sel:${sessionId}:${key}`
}

/** Saves the picked files (already in reading order) in sessionStorage and returns the key for `?sel=`; null when the browser refuses storage. */
export function saveBlueprintSelection(sessionId: string, paths: readonly string[]): string | null {
  const key = Math.random().toString(36).slice(2, 8)
  try {
    window.sessionStorage.setItem(selectionStorageKey(sessionId, key), JSON.stringify(paths))
    return key
  } catch {
    return null
  }
}

/** The files saved under `key`; null when there is no such key (a new tab, cleared storage) or its content is not a list of paths. */
export function loadBlueprintSelection(sessionId: string, key: string): string[] | null {
  try {
    const raw = window.sessionStorage.getItem(selectionStorageKey(sessionId, key))
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string') ? parsed : null
  } catch {
    return null
  }
}

/** The picked files in the diagram's reading order, then the ones it does not show by path. */
export function orderBlueprintSelection(selected: ReadonlySet<string>, diagramFiles: readonly string[]): string[] {
  const onDiagram = diagramFiles.filter((path) => selected.has(path))
  const shown = new Set(onDiagram)
  return [...onDiagram, ...[...selected].filter((path) => !shown.has(path)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))]
}

export interface BlueprintState {
  /** Null until loaded, and for a session without one (a test run). */
  blueprint: Blueprint | null
  /** The package tree of the analysed files; null with `blueprint`. */
  root: BlueprintPackage | null
  /** The agent's groupings as package trees (roots under `@<type>`), for the types it made; empty until loaded or without groups. */
  groupTrees: Partial<Record<BlueprintGroupingType, BlueprintGroupTree>>
  /** Only while groups were asked for: they are still on their way. */
  groupsLoading: boolean
  groupsError: Error | null
  loading: boolean
  error: Error | null
  reload: () => void
}

export interface BlueprintGroupsState {
  /** Null until loaded, when the agent grouped nothing, and while disabled. */
  groups: BlueprintGroups | null
  loading: boolean
  error: Error | null
}

/** `GET /api/sessions/:id/blueprint/groups`, refetched when the agent saved a grouping. `enabled: false` skips the request. */
export function useBlueprintGroups(sessionId: string, enabled = true): BlueprintGroupsState {
  const state = useAsync(enabled ? `blueprint-groups:${sessionId}` : null, () => apiGet<BlueprintGroupsResponse>(blueprintGroupsPath(sessionId)))
  const { reload } = state
  useStoreEvents({
    'blueprint-groups.updated': (event) => {
      if (enabled && event.sessionId === sessionId) reload()
    },
  })
  return { groups: state.data?.groups ?? null, loading: state.loading, error: state.error }
}

/**
 * `GET /api/sessions/:id/blueprint`, refetched when the session's tree changed (the stale analysis stays meanwhile).
 * `enabled: false` skips the request.
 * `withGroups` also loads the agent's groupings (code reviews only) and turns them into `groupTrees` over the files changed now.
 */
export function useBlueprint(sessionId: string, enabled = true, withGroups = false): BlueprintState {
  const state = useAsync(enabled ? `blueprint:${sessionId}` : null, () => apiGet<BlueprintResponse>(blueprintPath(sessionId)))
  const groupsState = useBlueprintGroups(sessionId, enabled && withGroups)
  const { reload } = state
  const fingerprint = state.data?.blueprint?.fingerprint
  useStoreEvents({
    'tree.updated': (event) => {
      if (enabled && event.sessionId === sessionId && event.fingerprint !== fingerprint) reload()
    },
  })
  const blueprint = state.data?.blueprint ?? null
  const root = useMemo(() => (blueprint === null ? null : buildBlueprintTree(blueprint.files.map((file) => file.path))), [blueprint])
  const { groups } = groupsState
  const groupTrees = useMemo(() => {
    const trees: Partial<Record<BlueprintGroupingType, BlueprintGroupTree>> = {}
    if (blueprint === null || groups === null) return trees
    const paths = blueprint.files.map((file) => file.path)
    for (const type of BLUEPRINT_GROUPING_TYPES) {
      const grouping = groups.groupings[type]
      if (grouping) trees[type] = buildBlueprintGroupTree(type, grouping, paths)
    }
    return trees
  }, [blueprint, groups])
  return { blueprint, root, groupTrees, groupsLoading: groupsState.loading, groupsError: groupsState.error, loading: state.loading, error: state.error, reload }
}

/**
 * The diagram `id` names (the whole change for an absent id); null while loading or when it no longer exists.
 * A group dir (`pkg:@feature/x`) is read from that grouping's tree (null when there is none), everything else from the folders.
 */
export function blueprintDiagramOf(state: Pick<BlueprintState, 'blueprint' | 'root' | 'groupTrees'>, id: string | null): BlueprintDiagram | null {
  if (state.blueprint === null || state.root === null) return null
  const ref = parseBlueprintDiagramId(id ?? BLUEPRINT_ROOT_DIAGRAM)
  if (ref === null) return null
  const type = ref.type === 'package' ? blueprintGroupingOfDir(ref.dir) : null
  if (type === null) return buildBlueprintDiagram(state.blueprint, state.root, ref)
  const tree = state.groupTrees[type]
  return tree ? buildBlueprintDiagram(state.blueprint, tree.root, ref) : null
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
